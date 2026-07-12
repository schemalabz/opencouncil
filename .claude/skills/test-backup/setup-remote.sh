#!/usr/bin/env bash
# One-time setup for the test-backup skill's S3 fetch mode.
#
# Registers a READ-ONLY rclone remote named `oc-backups` pointing at the
# DigitalOcean Spaces cold-storage backup bucket. Run it yourself in your
# terminal — it prompts for your key/secret with hidden input, so the
# credential stays in your local rclone config (~/.config/rclone/rclone.conf)
# and never touches the repo, shell history, or any agent transcript.
#
#   nix develop --command bash .claude/skills/test-backup/setup-remote.sh
#
# First create a read-only Spaces key in the DigitalOcean panel
# (API -> Spaces Keys), scoped to the `opencouncil-db-backups` bucket if
# scoping is offered.

set -euo pipefail

REMOTE="oc-backups"
BUCKET="opencouncil-db-backups"
ENDPOINT="fra1.digitaloceanspaces.com"
REGION="fra1"

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone not found. Run this inside the Nix dev shell:" >&2
  echo "  nix develop --command bash .claude/skills/test-backup/setup-remote.sh" >&2
  exit 1
fi

if rclone listremotes | grep -qx "${REMOTE}:"; then
  read -rp "Remote '${REMOTE}' already exists. Overwrite it? [y/N] " ANSWER
  case "$ANSWER" in
    [yY]*) ;;
    *) echo "Left the existing remote unchanged."; exit 0 ;;
  esac
fi

echo "Enter your READ-ONLY DigitalOcean Spaces key for '${BUCKET}'."
read -rp  "  Access key: " KEY
read -rsp "  Secret key: " SECRET; echo
if [ -z "$KEY" ] || [ -z "$SECRET" ]; then
  echo "Both keys are required — aborting." >&2
  exit 1
fi

rclone config create "$REMOTE" s3 \
  provider=DigitalOcean \
  endpoint="$ENDPOINT" \
  region="$REGION" \
  access_key_id="$KEY" \
  secret_access_key="$SECRET" >/dev/null

echo "Remote '${REMOTE}' created. Verifying access to '${BUCKET}'..."
if rclone lsf "${REMOTE}:${BUCKET}/" >/dev/null 2>&1; then
  echo "Success — the skill can now fetch backups with: /test-backup"
else
  echo "Remote created, but listing '${BUCKET}' failed. Check the key's" >&2
  echo "permissions/scope and the bucket name, then re-run this script." >&2
  exit 1
fi
