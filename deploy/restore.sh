#!/usr/bin/env bash
# Run manually on the production server: bash restore.sh <backup file>

set -euo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/database.sh"
configure_environment prod

[[ $# -eq 1 ]] || fail "Usage: bash restore.sh <backup file>"
backup_file="$(realpath -e -- "$1")"
[[ -f "$backup_file" && -r "$backup_file" && -s "$backup_file" ]] || fail "Backup must be a readable, nonempty file."

lock_environment

# Compose requires a tag even to look up the existing app container.
export APP_TAG=initial
app_tag="$(installed_app_tag)"
[[ -n "$app_tag" ]] || fail "No production app container to restart after the restore."
export APP_TAG="$app_tag"

database="$(compose exec -T postgres sh -ec 'printf "%s\n" "${POSTGRES_DB:?POSTGRES_DB is not set}"' </dev/null)"

log "Backup file: $backup_file"
log "Target database: $database (prod)"
log "App version to restart: $app_tag"
printf 'Type yes to replace the production database: '
if ! IFS= read -r answer || [[ "$answer" != yes ]]; then
  log "Restore cancelled."
  exit 0
fi

log "Checking that the backup can be read"
compose exec -T postgres pg_restore --format=custom --file=/dev/null <"$backup_file"

database_exists="$(compose exec -T postgres sh -ec '
  exec psql --no-psqlrc --no-password --tuples-only --no-align --set=ON_ERROR_STOP=1 \
    --set=target_db="$POSTGRES_DB" --username="$POSTGRES_USER" --dbname=template1
' <<'SQL'
SELECT 1 FROM pg_database WHERE datname = :'target_db';
SQL
)"
if [[ "$database_exists" == 1 ]]; then
  backup_database pre-restore "$app_tag"
else
  log "The target database is missing. There is no current database to back up."
fi

log "Stopping the production app"
compose stop app </dev/null

log "Recreating the production database"
compose exec -T postgres sh -ec '
  dropdb --if-exists --no-password --username="$POSTGRES_USER" -- "$POSTGRES_DB"
  createdb --template=template0 --no-password --username="$POSTGRES_USER" -- "$POSTGRES_DB"
' </dev/null

log "Loading the backup into the empty database"
compose exec -T postgres sh -ec '
  exec pg_restore --format=custom --single-transaction --no-password \
    --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
' <"$backup_file"

log "Starting the existing app container ($app_tag)"
compose start app </dev/null
log "Database restored from $backup_file"
