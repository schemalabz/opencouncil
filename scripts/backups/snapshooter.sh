# shellcheck shell=bash
# Variables here are read by the scripts that source this file.
# shellcheck disable=SC2034
# The SnapShooter dumps of the production databases in the backup bucket.
# Sourced by .claude/skills/test-backup/backup.sh and
# scripts/seed/refresh-staging.sh. Needs rclone and its read-only remote
# `oc-backups`, which .claude/skills/test-backup/setup-remote.sh sets up.

SNAPSHOOTER_BUCKET="oc-backups:opencouncil-db-backups/snapshooter"

# SnapShooter target directories. The hex prefix identifies a SnapShooter
# connection, not the job, so a directory cannot be derived from a job name.
declare -A SNAPSHOOTER_DIR=(
  [main]="32a534c3-opencouncil-prod-db-do"
  [notis]="07b9d0af-notis-prod-db-do"
)
declare -A SNAPSHOOTER_FILE=(
  [main]="production.sql.gz"
  [notis]="notis-production.sql.gz"
)

# Both jobs run daily. An older newest dump means a job has stopped, and a
# stopped job sends no failure notification.
SNAPSHOOTER_MAX_AGE_HOURS=30

# Fails, and says how to set it up, when the remote is missing.
snapshooter_require_remote() {
  grep -qx "oc-backups:" <(rclone listremotes) && return 0
  echo "error: the rclone remote 'oc-backups' is missing. Run it yourself: nix develop --command bash .claude/skills/test-backup/setup-remote.sh" >&2
  return 1
}

# The newest dump of a target (main or notis), as its path inside the target
# directory: YYYY/MM/DD/HH-MM/<file>, in UTC. Empty when the target holds none.
snapshooter_newest() {
  rclone lsf -R --files-only --include "${SNAPSHOOTER_FILE[$1]}" "$SNAPSHOOTER_BUCKET/${SNAPSHOOTER_DIR[$1]}/" | sort | tail -1
}

# When the dump at that path was taken, in seconds since the epoch.
snapshooter_dumped_at() {
  local y m d hm
  IFS=/ read -r y m d hm _ <<< "$1"
  date -u -d "$y-$m-$d ${hm/-/:}" +%s
}

# Downloads the dump of a target at that path into a file.
snapshooter_download() {
  rclone copyto "$SNAPSHOOTER_BUCKET/${SNAPSHOOTER_DIR[$1]}/$2" "$3"
}
