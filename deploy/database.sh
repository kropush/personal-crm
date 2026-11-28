# Shared server settings for deployment and database restoration.
base=/srv/personal-crm
image=ghcr.io/kropush/personal-crm

configure_environment() {
  environment="$1"
  case "$environment" in
    prod)
      root="$base"
      lock_file="$base/.production.lock"
      app_host=app.kropcrm.ru
      export APP_PORT=3000 APP_MEMORY_LIMIT=0 POSTGRES_MEMORY_LIMIT=0 MIGRATION_MEMORY_LIMIT=0
      ;;
    staging)
      root="$base/staging"
      lock_file="$base/.staging.lock"
      app_host=test-app.kropcrm.ru
      export APP_PORT=3001 APP_MEMORY_LIMIT=384m POSTGRES_MEMORY_LIMIT=256m MIGRATION_MEMORY_LIMIT=256m
      ;;
    *) fail "Unknown deployment environment: $environment" ;;
  esac
  export APP_ORIGIN="https://$app_host"
}

compose() {
  docker compose -p "$environment" -f "$root/deploy/compose.yaml" --env-file "$root/.env" "$@"
}

log() {
  echo "==> $*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

lock_environment() {
  exec {environment_lock}>>"$lock_file"
  local wait=0
  if [[ "$environment" == staging ]]; then
    # Production cleanup may hold this lock briefly to protect the staging image.
    wait=30
  fi
  flock -w "$wait" "$environment_lock" || fail "A deployment or database operation is already in progress for $environment."
}

installed_app_tag() {
  local container app_image
  container="$(compose ps --all --quiet app)" || return
  [[ -n "$container" ]] || return 0

  app_image="$(docker container inspect --format '{{.Config.Image}}' "$container")" || return
  [[ "$app_image" == "$image:"?* ]] || fail "Unexpected app image in $environment: $app_image"
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

load_initial_staging_database() {
  local has_data newest backup_file
  has_data="$(compose exec -T postgres sh -ec '
    exec psql --no-psqlrc --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 \
      --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
  ' <<'SQL'
SELECT EXISTS (
  SELECT FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
    AND namespace.nspname NOT LIKE 'pg\_%'
    AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
);
SQL
  )"
  [[ "$has_data" == f ]] || return 0

  newest="$(find "$base/backups" -maxdepth 1 -type f -name '*.dump' -printf '%T@ %f\n' |
    sort -nr | sed -n '1s/^[^ ]* //p')"
  [[ -n "$newest" ]] || fail "No production backup is available to initialize staging."
  backup_file="$base/backups/$newest"
  [[ -s "$backup_file" ]] || fail "The latest production backup is empty: $backup_file"

  log "Loading the latest production backup into the empty staging database: $newest"
  compose exec -T postgres sh -ec '
    exec pg_restore --format=custom --single-transaction --no-owner --no-privileges --no-password \
      --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
  ' <"$backup_file"
}
