# Shared production settings for deployment and database restoration.
root=/srv/personal-crm
image=ghcr.io/kropush/personal-crm

compose() {
  docker compose -p prod -f "$root/deploy/compose.yaml" --env-file "$root/.env" "$@"
}

log() {
  echo "==> $*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

lock_production() {
  exec {production_lock}>>"$root/.production.lock"
  flock -n "$production_lock" || fail "A production deployment or restore is already in progress."
}

installed_app_tag() {
  local container app_image
  container="$(compose ps --all --quiet app)" || return
  [[ -n "$container" ]] || return 0

  app_image="$(docker container inspect --format '{{.Config.Image}}' "$container")" || return
  [[ "$app_image" == "$image:"?* ]] || fail "Unexpected production app image: $app_image"
  printf '%s\n' "${app_image#"$image:"}"
}

backup_database() (
  local kind="$1" app_tag="$2"
  local backup_dir="$root/backups" temp_file backup_file

  umask 077
  install -d -m 700 "$backup_dir"
  temp_file="$(mktemp "$backup_dir/.backup.XXXXXXXX")"
  trap 'rm -f -- "$temp_file"' EXIT
  backup_file="$backup_dir/$kind-$app_tag-$(date -u +%Y%m%dT%H%M%SZ)-${temp_file##*.}.dump"

  log "Backing up the production database (app version: $app_tag)"
  if ! compose exec -T postgres sh -ec '
    exec pg_dump --format=custom --no-password --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
  ' </dev/null >"$temp_file"; then
    fail "Database backup failed."
  fi
  [[ -s "$temp_file" ]] || fail "Database backup is empty."

  mv -- "$temp_file" "$backup_file"
  log "Database backup saved: $backup_file"
)
