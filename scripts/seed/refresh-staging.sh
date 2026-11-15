#!/usr/bin/env bash
# Refresh staging with production's content: the newest SnapShooter dump of
# production, through `produce` and `verify`, into staging with `seed reset`,
# which keeps staging's private rows. See "Refreshing staging" in
# docs/database-seeding.md.
#
#   scripts/seed/refresh-staging.sh               fetch, produce, verify, reset
#   scripts/seed/refresh-staging.sh --from <run>  reset from a verified run directory
#   scripts/seed/refresh-staging.sh --keep        keep the run directory afterwards
#
# Run it inside `nix develop`, which brings rclone, greenmask, and the
# PostgreSQL tools. STAGING_DATABASE_URL names staging's database directly
# (port 25060, not the pool), as a role that owns staging's objects.
set -euo pipefail

# The dump holds every private row of production, and the artifact every
# content row: only the user who runs the script may read them.
umask 077

die() { echo "error: $*" >&2; exit 1; }

FROM=""
KEEP=false
while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:?--from needs a run directory}"; shift 2 ;;
    --keep) KEEP=true; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)" || die "not inside a git repository"
cd "$REPO_ROOT"
# shellcheck source=scripts/backups/snapshooter.sh
source scripts/backups/snapshooter.sh

URL="${STAGING_DATABASE_URL:?set STAGING_DATABASE_URL to the direct database URL of staging}"
# The seed commands write only to a host that the caller names.
HOST="$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$URL")"

# A checkout ahead of staging would migrate staging beyond the code that it
# runs. Check out the commit that staging runs.
checkout_head="$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | tail -1)"
staging_head="$(psql "$URL" -XAtq -c 'SELECT max(migration_name) FROM _prisma_migrations WHERE finished_at IS NOT NULL')"
[ "$checkout_head" = "$staging_head" ] \
  || die "staging is at the migration $staging_head and this checkout at $checkout_head"

# The runs live in .data/ of the checkout, so a run that a crash stopped leaves
# its directory where the next run finds it.
mkdir -p .data
for left in .data/staging-refresh.*; do
  [ -e "$left" ] && echo "warning: an earlier run left $left, which holds production content: delete it when you no longer need it" >&2
done
WORK="$(mktemp -d "$REPO_ROOT/.data/staging-refresh.XXXXXX")"
DUMP="$WORK/${SNAPSHOOTER_FILE[main]}"
# A verified artifact that a failed reset can start again from.
RESUME="$FROM"
cleanup() {
  local status=$?
  rm -f "$DUMP" "$DUMP".*.partial
  if [ "$KEEP" = true ]; then
    echo "kept $WORK" >&2
  elif [ "$status" -ne 0 ] && [ "$RESUME" != "${RESUME#"$WORK"/}" ]; then
    # The half hour of produce and verify does not have to run again.
    echo "kept the verified artifact in $WORK" >&2
  else
    rm -rf "$WORK"
  fi
  if [ "$status" -ne 0 ] && [ -n "$RESUME" ]; then
    echo "after the fix: scripts/seed/refresh-staging.sh --from $RESUME" >&2
  fi
}
trap cleanup EXIT
# Without these, a signal ends the script with status 0 in the EXIT trap.
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

if [ -z "$FROM" ]; then
  snapshooter_require_remote
  latest="$(snapshooter_newest main)"
  [ -n "$latest" ] || die "the bucket holds no production dump"
  age=$(( ($(date -u +%s) - $(snapshooter_dumped_at "$latest")) / 3600 ))
  [ "$age" -le "$SNAPSHOOTER_MAX_AGE_HOURS" ] \
    || die "the newest production dump is ${age}h old, over ${SNAPSHOOTER_MAX_AGE_HOURS}h: the SnapShooter job has stopped"
  echo "fetching the production dump $latest (${age}h old)"
  snapshooter_download main "$latest" "$DUMP"
  mkdir "$WORK/out"
  # `produce` prints the run directory as its only line on stdout.
  # Each command gets a work directory inside $WORK, so a run that a signal or a
  # crash stops does not leave a scratch cluster's files elsewhere.
  FROM="$(npm run --silent seed-pipeline -- produce --backup "$DUMP" --out "$WORK/out" --work "$WORK/produce")"
  [ -d "$FROM" ] || die "produce printed no run directory"
  # The artifact replaces the dump, which holds production's private rows.
  rm -rf "$DUMP" "$WORK/produce"
  npm run --silent seed-pipeline -- verify "$FROM" --work "$WORK/verify"
  rm -rf "$WORK/verify"
  RESUME="$FROM"
fi

npm run --silent seed -- reset --full --from "$FROM" --db "$URL" --trust-host "$HOST"
