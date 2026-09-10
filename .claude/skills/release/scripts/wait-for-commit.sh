#!/usr/bin/env bash
# Wait until the app at <health-url> reports that it runs <sha>.
#
# The format of the platform's commit value is undocumented, so the match is a
# prefix in either direction. A build and deploy takes about 10 minutes.
#
# Usage: wait-for-commit.sh <health-url> <sha> [timeout-seconds]
set -euo pipefail

URL="${1:?usage: wait-for-commit.sh <health-url> <sha> [timeout-seconds]}"
WANT="${2:?usage: wait-for-commit.sh <health-url> <sha> [timeout-seconds]}"
TIMEOUT="${3:-1800}"

deadline=$(( $(date +%s) + TIMEOUT ))

while [ "$(date +%s)" -lt "$deadline" ]; do
    got=$(curl -sf --max-time 20 -H 'Cache-Control: no-cache' "$URL" \
        | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit") or "")' 2>/dev/null || true)

    if [ -n "$got" ]; then
        case "$WANT" in "$got"*) echo "live: $got"; exit 0;; esac
        case "$got" in "$WANT"*) echo "live: $got"; exit 0;; esac
    fi

    echo "waiting: reported=${got:-<none>} want=${WANT:0:12}  $(( (deadline - $(date +%s)) / 60 ))m left"
    sleep 30
done

echo "TIMEOUT: $URL never reported $WANT" >&2
exit 1
