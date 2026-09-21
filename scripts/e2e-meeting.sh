#!/usr/bin/env bash
# Poll one meeting end to end against the local stack and print what landed:
# the roll call, per-subject attendance and votes, and the minutes data.
#
#   scripts/e2e-meeting.sh <cityId> <meetingId> [--force] [out.json]
#
# Needs the tasks server (TASK_API_URL) and this app (NEXTAUTH_URL) running.
set -euo pipefail
usage() { echo "usage: DATABASE_URL=postgresql://... scripts/e2e-meeting.sh <cityId> <meetingId> [--force] [out.json]" >&2; exit 2; }
# No default database: the wrong one answers every query below without saying so.
[ $# -ge 2 ] || usage
[ -n "${DATABASE_URL:-}" ] || usage
CITY=$1; MEETING=$2; shift 2
FORCE=""; OUT=""
for a in "$@"; do case "$a" in --force) FORCE=--force;; *) OUT=$a;; esac; done
PG="$DATABASE_URL"
q() { psql "$PG" -Atc "$1"; }

until curl -sf "${TASK_API_URL:-http://localhost:3005}/health" >/dev/null; do sleep 2; done
TASK=$(npx tsx scripts/poll-decisions-for-meeting.ts "$CITY" "$MEETING" $FORCE 2>/dev/null | sed -n 's/^TASK_ID=//p')
echo "task $TASK"
until s=$(q "select status from \"TaskStatus\" where id='$TASK'"); [ "$s" = succeeded ] || [ "$s" = failed ]; do sleep 10; done
echo "task $s"
echo "--- roll call"
q "select ma.status||' '||p.name from \"MeetingAttendance\" ma join \"Person\" p on p.id=ma.\"personId\" where ma.\"councilMeetingId\"='$MEETING' and ma.\"cityId\"='$CITY' order by 1"
echo "--- per-subject attendance"
q "select 'subj#'||coalesce(s.\"agendaItemIndex\"::text,'OA')||' '||sa.status||' ('||count(*)||'): '||string_agg(p.name, ', ' order by p.name) from \"SubjectAttendance\" sa join \"Subject\" s on s.id=sa.\"subjectId\" join \"Person\" p on p.id=sa.\"personId\" where s.\"councilMeetingId\"='$MEETING' and s.\"cityId\"='$CITY' group by s.\"agendaItemIndex\", sa.status order by 1"
echo "--- votes"
q "select 'subj#'||coalesce(s.\"agendaItemIndex\"::text,'OA')||' '||sv.\"voteType\"||' ('||count(*)||'): '||string_agg(p.name, ', ' order by p.name) from \"SubjectVote\" sv join \"Subject\" s on s.id=sv.\"subjectId\" join \"Person\" p on p.id=sv.\"personId\" where s.\"councilMeetingId\"='$MEETING' and s.\"cityId\"='$CITY' group by s.\"agendaItemIndex\", sv.\"voteType\" order by 1"
if [ -n "$OUT" ]; then npx tsx scripts/minutes-data-for-meeting.ts "$CITY" "$MEETING" "$OUT" 2>/dev/null | tail -1; fi
