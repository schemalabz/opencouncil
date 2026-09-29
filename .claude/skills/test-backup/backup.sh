#!/usr/bin/env bash
# Restore test for the SnapShooter database backups. See SKILL.md.
#
#   backup.sh test [main] [--keep]                          newest dumps from the bucket
#   backup.sh test --main <file> [--notis <file>] [--keep]  dumps you downloaded
#   backup.sh check                                          the checks again, on a kept cluster
#   backup.sh clean                                          remove a kept cluster and downloads
#
# It restores into a private PostgreSQL cluster that it creates for the run
# and deletes after it. It never touches a developer's database, never applies
# migrations, and never starts a service.
set -euo pipefail

# Everything this script creates holds production data or leads to it: the
# downloads, the logs, the cluster and its socket. Only the user who runs the
# script may read them.
umask 077

BUCKET="oc-backups:opencouncil-db-backups/snapshooter"

# SnapShooter target directories. The hex prefix identifies a SnapShooter
# connection, not the job, so a directory cannot be derived from a job name.
declare -A TARGET_DIR=(
  [main]="32a534c3-opencouncil-prod-db-do"
  [notis]="07b9d0af-notis-prod-db-do"
)
declare -A DUMP_FILE=(
  [main]="production.sql.gz"
  [notis]="notis-production.sql.gz"
)
declare -A TEST_DB=(
  [main]="backup_test_main"
  [notis]="backup_test_notis"
)

# Both jobs run daily. An older newest dump means a job has stopped, and a
# stopped job sends no failure notification.
MAX_AGE_HOURS="${BACKUP_TEST_MAX_AGE_HOURS:-30}"

DB_USER="opencouncil"

die() { echo "error: $*" >&2; exit 1; }

# A directory that only this user can use. In /tmp another user can create the
# path first, and an earlier version of this script left its directories open,
# so an existing directory must belong to this user and must not be a link.
private_dir() {
  local d="$1" owner
  [ -L "$d" ] && die "$d is a symbolic link. The test uses only a real directory that you own."
  mkdir -p "$d"
  owner="$(stat -c %u "$d")" || die "cannot read the owner of $d"
  [ "$owner" = "$(id -u)" ] \
    || die "$d belongs to $(stat -c %U "$d"). Only that user or root can remove it."
  chmod 700 "$d"
}

REPO_ROOT="$(git rev-parse --show-toplevel)" || die "not inside a git repository"

# Always a directory of its own, because private_dir restricts it to its owner.
# The default sits next to the cluster: a stable path that `clean` can find,
# in a tree that belongs to this user. TMPDIR is not stable here, because
# every `nix develop` shell sets a new one and does not remove it.
WORK_DIR="${OC_TEST_BACKUP_DIR:-$REPO_ROOT/.data}/oc-test-backup"

# The private cluster. Deleting its directory is the only way to remove the
# restored data completely: DROP DATABASE removes the tables, but every row the
# restore wrote stays in the write-ahead log until later writes overwrite it.
CLUSTER_ROOT="$REPO_ROOT/.data/backup-test"
CLUSTER_DATA="$CLUSTER_ROOT/data"
# A Unix socket path must stay under 107 bytes, and worktree paths are long.
SOCKET="/tmp/oc-bt-$(echo "$CLUSTER_ROOT" | md5sum | cut -c1-8)"

# PostgreSQL 16 with PostGIS, built by the flake. Resolved once, in the main
# shell, before anything uses it: inside $(...) a failure ends only the
# subshell, and the caller carries on with an empty value.
PG_BIN=""
resolve_pg() {
  local out
  out="$(nix build "$REPO_ROOT#postgres-postgis" --no-link --print-out-paths | tail -1)" \
    || die "cannot build PostgreSQL with PostGIS. Run: nix build .#postgres-postgis"
  PG_BIN="$out/bin"
  [ -x "$PG_BIN/initdb" ] || die "no initdb in $PG_BIN"
}

cluster_running() { [ -S "$SOCKET/.s.PGSQL.5432" ]; }

cluster_remove() {
  if [ -f "$CLUSTER_DATA/postmaster.pid" ]; then
    "${PG_BIN:?}/pg_ctl" -D "$CLUSTER_DATA" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "${CLUSTER_ROOT:?}"
  # A socket directory that another user created cannot be removed here;
  # private_dir then refuses it with a clear message.
  rm -rf "${SOCKET:?}" 2>/dev/null || true
}

cluster_start() {
  # A cluster left by a crashed run or a --keep run goes first.
  cluster_remove
  private_dir "$CLUSTER_ROOT"
  private_dir "$SOCKET"
  "$PG_BIN/initdb" -D "$CLUSTER_DATA" -U "$DB_USER" --auth=trust --no-sync --no-instructions -E UTF8 >/dev/null
  # No TCP listener, and a socket that only this user can open. The cluster is
  # deleted after the run, so it does not need crash safety.
  "$PG_BIN/pg_ctl" -D "$CLUSTER_DATA" -l "$CLUSTER_ROOT/server.log" -w \
    -o "-c listen_addresses='' -c unix_socket_directories=$SOCKET -c unix_socket_permissions=0700 -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
    start >/dev/null
}

lpsql() {
  local db="$1"; shift
  PGOPTIONS="-c client_min_messages=warning" \
    "${PG_BIN:?}/psql" -h "${SOCKET:?}" -U "$DB_USER" -d "$db" -v ON_ERROR_STOP=1 -X -q "$@"
}

db_exists() {
  [ "$(lpsql postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$1'")" = "1" ]
}

FAILURES=()
fail() { FAILURES+=("$1"); echo "  FAIL: $1"; }

# --- fetch and freshness ------------------------------------------------------

declare -A DUMP=() SOURCE=() DUMPED_AT=()
FETCHED=()

fetch() {
  local t="$1" dir="${TARGET_DIR[$1]}" file="${DUMP_FILE[$1]}" latest
  latest="$(rclone lsf -R --files-only --include "$file" "$BUCKET/$dir/" | sort | tail -1)"
  if [ -z "$latest" ]; then
    echo "  target $dir holds no $file. Targets in the bucket:"
    rclone lsf "$BUCKET/" | sed 's/^/    /'
    return 1
  fi
  # Registered before the download starts, so that cleanup also deletes a file
  # that an interrupted run completed or left partial.
  FETCHED+=("$WORK_DIR/$file")
  rclone copyto "$BUCKET/$dir/$latest" "$WORK_DIR/$file" || return 1
  DUMP[$t]="$WORK_DIR/$file"
  SOURCE[$t]="$dir/$latest"
  # The path is YYYY/MM/DD/HH-MM/<file>, in UTC.
  local y m d hm
  IFS=/ read -r y m d hm _ <<< "$latest"
  DUMPED_AT[$t]="$(date -u -d "$y-$m-$d ${hm/-/:}" +%s)"
}

check_freshness() {
  local t="$1"
  if [ -z "${DUMPED_AT[$t]:-}" ]; then
    echo "  dumped: unknown, local file"
    return 0
  fi
  local age=$(( ($(date -u +%s) - ${DUMPED_AT[$t]}) / 3600 ))
  echo "  dumped: $(date -u -d "@${DUMPED_AT[$t]}" '+%Y-%m-%d %H:%M UTC'), ${age}h ago"
  if [ "$age" -gt "$MAX_AGE_HOURS" ]; then
    fail "$t: the newest dump is ${age}h old, over the ${MAX_AGE_HOURS}h limit. The SnapShooter job has stopped."
  fi
}

# --- inspect ------------------------------------------------------------------

# Migrations applied in the dump, against those in the code. Pending or ahead
# migrations are reported, not applied: applying them would test the
# migrations, not the backup.
inspect() {
  local t="$1" dump="${DUMP[$1]}" dir out dumped code pending ahead
  if ! gzip -t "$dump" 2>/dev/null; then
    fail "$t: $dump is not a valid gzip file"
    return 1
  fi
  case "$t" in
    main) dir="$REPO_ROOT/prisma/migrations" ;;
    notis) dir="$REPO_ROOT/services/notis/prisma/migrations" ;;
  esac
  out="$(gunzip -c "$dump" | awk -F'\t' '
    /^-- Dumped from database version / { sub(/^-- Dumped from database version /, ""); print "V:" $0; next }
    /^COPY public\._prisma_migrations / {
      # Read the column order from the COPY header instead of assuming it.
      line = $0; sub(/^[^(]*\(/, "", line); sub(/\).*$/, "", line)
      n = split(line, cols, /, */)
      for (i = 1; i <= n; i++) { gsub(/"/, "", cols[i]); idx[cols[i]] = i }
      inmig = 1; next
    }
    inmig && /^\\\.$/ { inmig = 0; next }
    # Applied means finished and not rolled back.
    inmig && $idx["finished_at"] != "\\N" && $idx["rolled_back_at"] == "\\N" { print "M:" $idx["migration_name"] }
  ')"
  dumped="$(sed -n 's/^M://p' <<< "$out" | sort -u)"
  code="$(find "$dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)"
  pending="$(comm -23 <(echo "$code") <(echo "$dumped") | grep . || true)"
  ahead="$(comm -13 <(echo "$code") <(echo "$dumped") | grep . || true)"
  echo "  source PostgreSQL: $(sed -n 's/^V://p' <<< "$out")"
  echo "  migrations: $(grep -c . <<< "$dumped" || true) in the dump, $(grep -c . <<< "$code" || true) in the code"
  if [ -n "$pending" ]; then
    echo "  pending, in the code but not in the dump:"
    sed 's/^/    /' <<< "$pending"
  fi
  if [ -n "$ahead" ]; then
    echo "  ahead, in the dump but not in the code. Rebase this branch:"
    sed 's/^/    /' <<< "$ahead"
  fi
}

# --- restore ------------------------------------------------------------------

# Expected errors have one of two causes. Each is matched as a class rather
# than as a list of names, so a new cloud role or extension object needs no
# change here:
#   - a cloud role that does not exist locally. Neither dump carries CREATE
#     ROLE. It costs an owner or a grant, never data.
#   - a managed-provider extension (aiven_extras, vector) that is not
#     available locally, and every object inside its schema.
EXPECTED_ERRORS='^role "[^"]+" does not exist$'
EXPECTED_ERRORS+='|^extension "(aiven_extras|vector)" (is not available|does not exist)$'
EXPECTED_ERRORS+='|^schema "aiven_extras" does not exist$'
EXPECTED_ERRORS+='|^(function|relation) "?aiven_extras\.'

classify() {
  local log="${1:?restore error log required}"
  local errors roles expected real
  errors="$(grep -oE 'ERROR:  .*' "$log" | sed 's/^ERROR:  //' || true)"
  roles="$(grep -E '^role "[^"]+" does not exist$' <<< "$errors" | sed -E 's/^role "([^"]+)".*/\1/' | sort -u | tr '\n' ' ' || true)"
  expected="$(grep -cE "$EXPECTED_ERRORS" <<< "$errors" || true)"
  real="$(grep -vE "$EXPECTED_ERRORS" <<< "$errors" | grep . || true)"
  echo "  restore errors: $expected expected${roles:+, from missing roles: ${roles% }}"
  if [ -n "$real" ]; then
    echo "  unexpected errors, full log at $log:"
    sort <<< "$real" | uniq -c | sort -rn | head -20 | sed 's/^ */    /'
    return 1
  fi
}

restore() {
  local t="$1" db="${TEST_DB[$1]}" log="$WORK_DIR/$1.restore-errors.log"
  # template0, as PostgreSQL recommends for restoring a dump: the restore
  # then starts from a database with nothing added to it.
  lpsql postgres -c "CREATE DATABASE \"$db\" TEMPLATE template0;"
  # No ON_ERROR_STOP: the dump names cloud roles that do not exist locally, and
  # each of those statements fails on its own without affecting the data.
  gunzip -c "${DUMP[$t]}" | "$PG_BIN/psql" -h "$SOCKET" -U "$DB_USER" -d "$db" -X -q >/dev/null 2>"$log" || true
  if ! classify "$log"; then
    fail "$t: the restore produced unexpected errors"
  fi
}

# --- checks -------------------------------------------------------------------

count_rows() {
  lpsql "$1" -tAc "$2" 2>&1
}

# Key tables must exist and hold rows. A dump of the wrong database, or an
# empty one, fails here.
check_counts() {
  local t="$1" db="${TEST_DB[$1]}" tables out summary="  rows:"
  case "$t" in
    main) tables=(City CouncilMeeting Person User Utterance Word Subject) ;;
    notis) tables=(NotisSubscription NotisWake NotisMessage) ;;
  esac
  for table in "${tables[@]}"; do
    if ! out="$(count_rows "$db" "SELECT count(*) FROM \"$table\"")"; then
      fail "$t: cannot read table \"$table\": ${out##*ERROR:  }"
      continue
    fi
    summary+=" $table $out,"
    [ "$out" -gt 0 ] || fail "$t: table \"$table\" is empty"
  done
  echo "${summary%,}"

  if [ "$t" = main ]; then
    if ! out="$(count_rows "$db" 'SELECT count(*) FROM "City" WHERE geometry IS NOT NULL')"; then
      fail "main: cannot read City.geometry: ${out##*ERROR:  }"
    else
      echo "  cities with geometry: $out"
      [ "$out" -gt 0 ] || fail "main: no city has geometry, so the PostGIS data is missing"
    fi
  fi
}

# Notis stores a bare userId, with no foreign key into the main database, and
# reads users through the notis_users view. The two jobs run at different
# times, so a reader who signed up between them is in Notis and not yet in the
# main dump. Such a subscription is newer than every user in the main dump. An
# unresolved active subscription that is older has lost its user.
check_pair() {
  local main="${TEST_DB[main]}" notis="${TEST_DB[notis]}" out
  lpsql "$main" -c 'DROP TABLE IF EXISTS _backup_test_subscriptions; CREATE TABLE _backup_test_subscriptions ("userId" text, status text, "createdAt" timestamp(3));'
  lpsql "$notis" -c 'COPY (SELECT "userId", status::text, "createdAt" FROM "NotisSubscription") TO STDOUT' \
    | lpsql "$main" -c 'COPY _backup_test_subscriptions FROM STDIN'
  if ! out="$(lpsql "$main" -tA -F'|' -c '
    WITH newest AS (SELECT max("createdAt") AS at FROM notis_users),
    s AS (
      SELECT s.status, s."createdAt", u.id IS NOT NULL AS resolved
      FROM _backup_test_subscriptions s LEFT JOIN notis_users u ON u.id = s."userId"
    )
    SELECT
      count(*),
      count(*) FILTER (WHERE resolved),
      count(*) FILTER (WHERE status = $$active$$),
      count(*) FILTER (WHERE status = $$active$$ AND resolved),
      count(*) FILTER (WHERE NOT resolved AND "createdAt" > (SELECT at FROM newest)),
      count(*) FILTER (WHERE NOT resolved AND "createdAt" <= (SELECT at FROM newest) AND status = $$active$$),
      left((SELECT at FROM newest)::text, 16)
    FROM s' 2>&1)"; then
    fail "pair: cannot compare the two dumps: ${out##*ERROR:  }"
    return 0
  fi
  local total resolved active active_resolved gap unexplained newest
  IFS='|' read -r total resolved active active_resolved gap unexplained newest <<< "$out"
  echo "  subscriptions whose user is in the main dump: $resolved/$total, active $active_resolved/$active"
  echo "  not in the main dump, signed up after its newest user ($newest UTC): $gap"
  [ "$unexplained" -eq 0 ] || fail "pair: $unexplained active Notis subscriptions refer to users that the main dump does not have"
}

run_checks() {
  for t in "$@"; do
    echo "$t, in ${TEST_DB[$t]}"
    check_counts "$t"
  done
  if [ "$#" -eq 2 ]; then
    echo "pair"
    check_pair
  fi
}

# --- cleanup and result -------------------------------------------------------

KEEP=0
RESULT_PRINTED=0
# The restored data holds readers' names and phone numbers. The cluster and the
# downloads go when the run ends, whether it passed or failed, unless --keep
# was given.
cleanup() {
  local rc=$?
  # An unexpected error or a signal ends the run before result() prints. The
  # report must still end in a verdict.
  if [ "$rc" -ne 0 ] && [ "$RESULT_PRINTED" = 0 ]; then
    echo
    echo "RESULT: FAIL (the test stopped before it finished: an interrupt, or the error shown above)"
  fi
  [ "$KEEP" = 1 ] && return 0
  if [ -n "$PG_BIN" ]; then cluster_remove >/dev/null 2>&1 || true; fi
  local f
  for f in "${FETCHED[@]}"; do rm -f "$f" "$f".*.partial; done
  return 0
}

result() {
  RESULT_PRINTED=1
  echo
  if [ "$KEEP" = 1 ]; then
    echo "kept: the cluster at $CLUSTER_ROOT, running on $SOCKET, and the files in $WORK_DIR."
    echo "They hold production data. Remove them with: backup.sh clean"
  fi
  if [ "${#FAILURES[@]}" -eq 0 ]; then
    echo "RESULT: PASS"
    return 0
  fi
  echo "RESULT: FAIL (${#FAILURES[@]})"
  printf '  - %s\n' "${FAILURES[@]}"
  return 1
}

# --- commands -----------------------------------------------------------------

cmd_test() {
  local only_main=0 main_file="" notis_file=""
  while [ $# -gt 0 ]; do
    case "$1" in
      main) only_main=1 ;;
      --keep) KEEP=1 ;;
      --main) main_file="${2:?--main needs a file}"; shift ;;
      --notis) notis_file="${2:?--notis needs a file}"; shift ;;
      *) die "unknown argument: $1" ;;
    esac
    shift
  done
  trap cleanup EXIT
  trap 'exit 130' INT TERM
  private_dir "$WORK_DIR"

  local ts=()
  if [ -n "$main_file" ]; then
    [ -f "$main_file" ] || die "no such file: $main_file"
    DUMP[main]="$main_file"; SOURCE[main]="$main_file"; ts+=(main)
    if [ -n "$notis_file" ]; then
      [ -f "$notis_file" ] || die "no such file: $notis_file"
      DUMP[notis]="$notis_file"; SOURCE[notis]="$notis_file"; ts+=(notis)
    fi
  else
    grep -qx "oc-backups:" <(rclone listremotes) \
      || die "the rclone remote 'oc-backups' is missing. Run it yourself: nix develop --command bash .claude/skills/test-backup/setup-remote.sh"
    ts=(main)
    [ "$only_main" = 1 ] || ts+=(notis)
  fi

  resolve_pg
  echo "Backup restore test, $(date -u '+%Y-%m-%d %H:%M UTC')"
  cluster_start
  echo "private cluster: $CLUSTER_ROOT, socket only, deleted after the run"

  local restored=()
  for t in "${ts[@]}"; do
    echo
    echo "$t"
    if [ -z "${DUMP[$t]:-}" ] && ! fetch "$t"; then
      fail "$t: no dump to test"
      continue
    fi
    echo "  source: ${SOURCE[$t]}, $(du -h "${DUMP[$t]}" | cut -f1)"
    check_freshness "$t"
    inspect "$t" || continue
    restore "$t"
    restored+=("$t")
  done

  echo
  if [ "${#restored[@]}" -gt 0 ]; then run_checks "${restored[@]}"; fi
  result
}

cmd_check() {
  resolve_pg
  cluster_running || die "no kept cluster. Run: backup.sh test --keep"
  local ts=()
  for t in main notis; do
    if db_exists "${TEST_DB[$t]}"; then ts+=("$t"); fi
  done
  [ "${#ts[@]}" -gt 0 ] || die "the kept cluster holds no restored database"
  KEEP=1
  run_checks "${ts[@]}"
  result
}

cmd_clean() {
  resolve_pg
  cluster_remove
  echo "removed the cluster at $CLUSTER_ROOT"
  local f
  for f in "$WORK_DIR/${DUMP_FILE[main]}" "$WORK_DIR/${DUMP_FILE[notis]}"; do rm -f "$f" "$f".*.partial; done
  # A failed restore can spill table rows into its error log.
  rm -f "$WORK_DIR"/*.restore-errors.log
  echo "removed downloaded dumps and restore logs from $WORK_DIR"
}

case "${1:-}" in
  test) shift; cmd_test "$@" ;;
  check) shift; cmd_check "$@" ;;
  clean) shift; cmd_clean "$@" ;;
  *) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
