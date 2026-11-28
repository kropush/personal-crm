#!/usr/bin/env bash
# Runs in GitHub Actions after the image is pushed to GHCR: copies deploy/ to
# the server and runs deploy.sh there. Usage: ci-deploy.sh <prod|staging>
#
# Environment, set by .github/workflows/deploy.yml:
#   DEPLOY_HOST, DEPLOY_USER   the server and the user to log in as
#   DEPLOY_SSH_KEY             private part of the deploy key
#   DEPLOY_KNOWN_HOSTS         the server's host key: any other server is refused
#   IMAGE_TAG                  the image tag to deploy (commit SHA)
#   REGISTRY_TOKEN             short-lived token to pull the image from GHCR

set -euo pipefail

remote_dir=/srv/personal-crm
environment="${1:?Usage: ci-deploy.sh <prod|staging>}"
if [[ "$environment" != prod && "$environment" != staging ]]; then
  echo "ERROR: Unknown deployment environment: $environment" >&2
  exit 1
fi
if [[ ! "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: Expected a full commit SHA." >&2
  exit 1
fi

install -d -m 700 ~/.ssh
(umask 077 && printf '%s\n' "$DEPLOY_SSH_KEY" >~/.ssh/deploy_key)
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" >~/.ssh/known_hosts

server=(ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes -o BatchMode=yes
  -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST")

echo "==> Copying deploy/ for $environment"
# The first line carries the token. The rest is the whole deploy directory.
{
  printf '%s\n' "$REGISTRY_TOKEN"
  tar -czf - -C deploy .
} | "${server[@]}" "set -e
  IFS= read -r token
  incoming=\$(mktemp -d '$remote_dir/.deploy.XXXXXXXX')
  trap 'rm -rf -- \"\$incoming\"' EXIT
  mkdir \"\$incoming/deploy\"
  tar -xzf - -C \"\$incoming/deploy\"
  printf '%s\\n' \"\$token\" | bash \"\$incoming/deploy/deploy.sh\" '$IMAGE_TAG' '$environment' --publish"
