#!/usr/bin/env bash
# Deploys one version of the app on the server:
#   database backup -> image from GHCR -> migrations -> new app container
#   -> smoke check of /health -> only the current and the previous image stay.
#
#   deploy.sh <tag>    tag = full SHA of the commit the image was built from
#
# CI passes a short-lived GHCR token on stdin. Run by hand, for example to go
# back to the previous version, it needs no token: that image is kept here.
# Nothing is rolled back automatically: a failed step stops the script with an
# error and leaves everything as it is.

set -euo pipefail

tag="${1:?Usage: deploy.sh <image tag (commit SHA)>}"

source "$(dirname -- "${BASH_SOURCE[0]}")/database.sh"

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

lock_production

backup_tag="$(installed_app_tag)"
if [[ -z "$backup_tag" ]]; then
  if [[ -f "$current_file" ]]; then
    backup_tag="$(cat "$current_file")"
  fi
  backup_tag="${backup_tag:-initial}"
fi

log "Waiting for the database"
# Keep the existing database container in place until its backup is saved.
compose up -d --wait --no-recreate postgres </dev/null
backup_database pre-deploy "$backup_tag"

log "Deploying $image:$tag"

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

log "Applying database container configuration"
compose up -d --wait postgres </dev/null

log "Applying migrations"
# A failed migration stops the script here: the new app version does not start
compose run --rm migrate

log "Starting the new app version"
compose up -d app

log "Smoke check: /health on the app"
if ! smoke_check http://127.0.0.1:3000/health; then
  log "FAILED: the app does not answer on /health. Nothing was rolled back."
  compose ps app
  compose logs --tail 50 app
  exit 1
fi

log "Smoke check: /health through nginx"
if ! smoke_check https://app.kropcrm.ru/health --resolve app.kropcrm.ru:443:127.0.0.1; then
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
previous="$(cat "$previous_file" 2>/dev/null || true)"

log "Removing old images, keeping $tag and ${previous:-none}"
docker image ls "$image" --format '{{.Tag}}' | while read -r old_tag; do
  if [ "$old_tag" != "$tag" ] && [ "$old_tag" != "$previous" ]; then
    docker image rm "$image:$old_tag" || log "Could not remove $image:$old_tag"
  fi
done
docker image prune -f >/dev/null

log "Deployed $tag"
