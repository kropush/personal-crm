#!/usr/bin/env bash
# Runs in GitHub Actions after the image is pushed to GHCR: copies deploy/ to
# the server and runs deploy.sh there.
#
# Environment, set by .github/workflows/deploy.yml:
#   DEPLOY_HOST, DEPLOY_USER   the server and the user to log in as
#   DEPLOY_SSH_KEY             private part of the deploy key
#   DEPLOY_KNOWN_HOSTS         the server's host key: any other server is refused
#   IMAGE_TAG                  the image tag to deploy (commit SHA)
#   REGISTRY_TOKEN             short-lived token to pull the image from GHCR

set -euo pipefail

remote_dir=/srv/personal-crm

install -d -m 700 ~/.ssh
(umask 077 && printf '%s\n' "$DEPLOY_SSH_KEY" >~/.ssh/deploy_key)
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" >~/.ssh/known_hosts

server=(ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes -o BatchMode=yes
  -o StrictHostKeyChecking=yes "$DEPLOY_USER@$DEPLOY_HOST")

echo "==> Copying deploy/ to the server"
# A fresh copy every time, so files deleted from the repo disappear there too
tar -czf - -C deploy . | "${server[@]}" "set -e
  rm -rf $remote_dir/deploy.new
  mkdir $remote_dir/deploy.new
  tar -xzf - -C $remote_dir/deploy.new
  rm -rf $remote_dir/deploy
  mv $remote_dir/deploy.new $remote_dir/deploy"

printf '%s\n' "$REGISTRY_TOKEN" | "${server[@]}" "$remote_dir/deploy/deploy.sh $IMAGE_TAG"
