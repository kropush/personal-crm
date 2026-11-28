#!/usr/bin/env bash
# Deploys one version of the app on the server. Production backs up its database
# first. Staging loads the latest production backup only into an empty database.
#
#   deploy.sh <tag> [prod|staging]
#   tag = full SHA of the commit the image was built from
#
# CI passes a short-lived GHCR token on stdin. Run by hand, for example to go
# back to the previous version, it needs no token: that image is kept here.
# Nothing is rolled back automatically: a failed step stops the script with an
# error and leaves everything as it is.

set -euo pipefail

tag="${1:?Usage: deploy.sh <image tag (commit SHA)> [prod|staging]}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

source "$script_dir/database.sh"
configure_environment "${2:-prod}"
[[ "$tag" =~ ^[0-9a-f]{40}$ ]] || fail "Expected a full commit SHA."
[[ -f "$root/.env" ]] || fail "Create $root/.env before deploying $environment."

# Tags of the versions that passed the smoke check
current_file="$root/release-current"
previous_file="$root/release-previous"

export APP_TAG="$tag"

smoke_check() {
  local url="$1"
  shift
  for _ in $(seq 1 30); do
    # Quiet while the app is starting; the last attempt below shows the error
    if curl -fs --max-time 5 "$@" "$url"; then
      echo
      return 0
    fi
    sleep 2
  done
  curl -fsS --max-time 5 "$@" "$url"
}

prune_old_images() (
  local current="$1" previous="$2" staging_image cutoff old_tag created
  exec {staging_lock}>>"$base/.staging.lock"
  if ! flock -n "$staging_lock"; then
    log "Skipping image cleanup while staging is deploying"
    return 0
  fi

  staging_image="$(docker ps --all --filter label=com.docker.compose.project=staging \
    --filter label=com.docker.compose.service=app --format '{{.Image}}')"
  cutoff="$(date -d '14 days ago' +%s)"
  log "Removing CRM images older than 14 days, keeping both production releases and the staging image"
  docker image ls "$image" --format '{{.Tag}}' | while IFS= read -r old_tag; do
    [[ "$old_tag" =~ ^[0-9a-f]{40}$ ]] || continue
    [[ "$old_tag" != "$current" && "$old_tag" != "$previous" && "$image:$old_tag" != "$staging_image" ]] || continue
    created="$(docker image inspect --format '{{.Created}}' "$image:$old_tag")"
    if [[ "$(date -d "$created" +%s)" -lt "$cutoff" ]]; then
      docker image rm "$image:$old_tag" || log "Could not remove $image:$old_tag"
    fi
  done
)

lock_environment

# CI uploads into a temporary directory and publishes under the same lock as
# the deployment. Keep the previous scripts available until the rename succeeds.
if [[ "${3:-}" == --publish ]]; then
  previous_scripts="$(dirname -- "$script_dir")/previous"
  if [[ -d "$root/deploy" ]]; then
    mv -T -- "$root/deploy" "$previous_scripts"
  fi
  if ! mv -T -- "$script_dir" "$root/deploy"; then
    if [[ -d "$previous_scripts" ]]; then
      mv -T -- "$previous_scripts" "$root/deploy"
    fi
    fail "Could not publish the deployment scripts for $environment."
  fi
fi

log "Deploying $image:$tag to $environment"

if docker image inspect "$image:$tag" >/dev/null 2>&1; then
  log "The image is already on the server"
else
  log "Pulling the image"
  token=""
  if [ ! -t 0 ]; then
    read -r token || true
  fi
  # A throwaway Docker config, so the registry token is not left on disk
  docker_config="$(mktemp -d)"
  trap 'rm -rf "$docker_config"' EXIT
  if [ -n "$token" ]; then
    printf '%s\n' "$token" |
      DOCKER_CONFIG="$docker_config" docker login ghcr.io -u kropush --password-stdin
  fi
  DOCKER_CONFIG="$docker_config" docker pull "$image:$tag"
fi

log "Waiting for the database"
# Keep the existing database container in place until its backup is saved.
compose up -d --wait --no-recreate postgres </dev/null

target_uses_ownership="$(docker image inspect --format '{{ index .Config.Labels "com.kropcrm.contact-ownership" }}' "$image:$tag")"
if [[ "$target_uses_ownership" == true ]]; then
  if ! compose run --rm --no-deps --entrypoint /bin/sh app -ec '
    test "${#BETTER_AUTH_SECRET}" -ge 32 && test -n "$RESEND_API_KEY"
  ' </dev/null; then
    fail "Set BETTER_AUTH_SECRET (at least 32 characters) and RESEND_API_KEY before deploying sign-in."
  fi
fi

if [[ "$environment" == staging ]]; then
  load_initial_staging_database
fi

database_uses_ownership="$(compose exec -T postgres sh -ec '
  exec psql --no-psqlrc --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
' <<'SQL'
SELECT to_regclass('public."user"') IS NOT NULL;
SQL
)"

if [[ "$target_uses_ownership" == true ]]; then
  if [[ "$database_uses_ownership" == f ]]; then
    log "Stopping the old app before the ownership migration"
    compose stop app </dev/null
  fi
elif [[ "$database_uses_ownership" == t ]]; then
  fail "Restore the matching pre-ownership backup before deploying this older image."
fi

if [[ "$environment" == prod ]]; then
  backup_tag="$(installed_app_tag)"
  if [[ -z "$backup_tag" && -f "$current_file" ]]; then
    backup_tag="$(cat "$current_file")"
  fi
  backup_database pre-deploy "${backup_tag:-initial}"
fi

log "Applying database container configuration"
compose up -d --wait postgres </dev/null

log "Applying migrations"
# A failed migration stops the script here: the new app version does not start
compose run --rm migrate </dev/null

log "Starting the new app version"
compose up -d app </dev/null

log "Smoke check: /health on the app"
if ! smoke_check "http://127.0.0.1:$APP_PORT/health"; then
  log "FAILED: the app does not answer on /health. Nothing was rolled back."
  compose ps app
  compose logs --tail 50 app
  exit 1
fi

log "Smoke check: /health through nginx"
if ! smoke_check "$APP_ORIGIN/health" --resolve "$app_host:443:127.0.0.1"; then
  log "FAILED: nginx does not pass /health to the app. Nothing was rolled back."
  exit 1
fi

current="$(cat "$current_file" 2>/dev/null || true)"
if [ "$current" != "$tag" ]; then
  if [ -n "$current" ]; then
    echo "$current" >"$previous_file"
  fi
  echo "$tag" >"$current_file"
fi
if [[ "$environment" == prod ]]; then
  previous="$(cat "$previous_file" 2>/dev/null || true)"
  prune_old_images "$tag" "$previous"
fi

log "Deployed $tag to $environment"
