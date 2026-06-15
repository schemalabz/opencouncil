#!/usr/bin/env bash
set -o pipefail

# Copy a single meeting (and all its related data) from one database to another.
# Assumes reference data (City, Person, Party, Topic, etc.) already exists in the target.

usage() {
    cat <<'EOF'
Copy a single meeting and all its related data between databases.

Usage:
  copy_meeting.sh --source=<url> --target=<url> --city-id=<id> --meeting-id=<id>

Options:
  --source=<url>       Source PostgreSQL connection string
  --target=<url>       Target PostgreSQL connection string
  --city-id=<id>       City ID of the meeting to copy
  --meeting-id=<id>    Meeting ID (CouncilMeeting.id) to copy
  -h, --help           Show this help message

What it copies (18 tables):
  CouncilMeeting, SpeakerSegment, Subject, TaskStatus, Highlight, PodcastSpec,
  MeetingAttendance, Utterance, TopicLabel, Summary, SubjectSpeakerSegment,
  SpeakerContribution, Decision, SubjectAttendance, SubjectVote,
  HighlightedUtterance, PodcastPart, PodcastPartAudioUtterance

What it does NOT copy:
  - Reference data (City, Person, Party, Topic, SpeakerTag, etc.) — must already
    exist in the target. Run copy_db.sh first if they don't.
  - Words (too large, rarely needed for dev)
  - User data (FKs to User are NULLed out)

Behavior:
  If the meeting already exists in the target, all its data is deleted first and
  replaced with a fresh copy from the source. Other data in the target is untouched.

Example:
  ./scripts/copy_meeting.sh \
    --source=postgresql://user:pass@prod-host/opencouncil \
    --target=postgresql://localhost/opencouncil \
    --city-id=clx1abc23 \
    --meeting-id=cly4def56
EOF
    exit 0
}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -h|--help) usage ;;
        --source=*) SOURCE="${1#*=}" ;;
        --target=*) TARGET="${1#*=}" ;;
        --city-id=*) CITY_ID="${1#*=}" ;;
        --meeting-id=*) MEETING_ID="${1#*=}" ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$SOURCE" ] || [ -z "$TARGET" ] || [ -z "$CITY_ID" ] || [ -z "$MEETING_ID" ]; then
    usage
fi

# Verify the meeting exists in source
MEETING_NAME=$(psql "$SOURCE" -t -A -c "SELECT name FROM \"CouncilMeeting\" WHERE \"cityId\" = '$CITY_ID' AND id = '$MEETING_ID';")
if [ -z "$MEETING_NAME" ]; then
    echo -e "\033[31mMeeting not found in source database (cityId=$CITY_ID, id=$MEETING_ID). Aborting.\033[0m"
    exit 1
fi
echo "Found meeting: $MEETING_NAME"

# Confirmation
TARGET_DB_NAME=$(echo $TARGET | sed -n 's#.*/\([^/?]*\).*#\1#p')
RANDOM_STRING=$(openssl rand -base64 6 | tr -dc 'A-Za-z0-9' | head -c 3)
CONFIRMATION_CODE="COPY-${TARGET_DB_NAME}-$RANDOM_STRING"

echo -e "\033[33mThis will delete existing data for this meeting in the target and replace it with source data."
echo -e "  Source: $SOURCE"
echo -e "  Target: $TARGET"
echo -e "  Meeting: $MEETING_NAME"
echo -e "\nEnter $CONFIRMATION_CODE to continue.\033[0m"

read -p "Enter the confirmation code: " CONFIRMATION
if [ "$CONFIRMATION" != "$CONFIRMATION_CODE" ]; then
    echo "Confirmation failed. Exiting."
    exit 1
fi

# Check migration state (reuse logic from copy_db.sh)
echo "Checking migration state..."
SOURCE_MIGRATIONS=$(psql "$SOURCE" -t -A -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at;")
TARGET_MIGRATIONS=$(psql "$TARGET" -t -A -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at;")
if [ -z "$SOURCE_MIGRATIONS" ] || [ -z "$TARGET_MIGRATIONS" ]; then
    echo -e "\033[31mCould not read migration state from one or both databases. Aborting.\033[0m"
    exit 1
fi

MISSING_MIGRATIONS=()
while IFS= read -r migration; do
    if ! grep -qxF "$migration" <<< "$TARGET_MIGRATIONS"; then
        MISSING_MIGRATIONS+=("$migration")
    fi
done <<< "$SOURCE_MIGRATIONS"

if [ ${#MISSING_MIGRATIONS[@]} -gt 0 ]; then
    echo -e "\033[31mTarget is missing ${#MISSING_MIGRATIONS[@]} migration(s). Run migrations first. Aborting.\033[0m"
    for m in "${MISSING_MIGRATIONS[@]}"; do echo -e "\033[31m  - $m\033[0m"; done
    exit 1
fi
echo "Migration state OK."

# Verify reference data exists in target.
# Check that the city and all referenced SpeakerTags/Persons exist.
echo "Checking reference data in target..."

TARGET_CITY=$(psql "$TARGET" -t -A -c "SELECT id FROM \"City\" WHERE id = '$CITY_ID';")
if [ -z "$TARGET_CITY" ]; then
    echo -e "\033[31mCity $CITY_ID not found in target database. Run copy_db.sh first or copy reference data. Aborting.\033[0m"
    exit 1
fi

echo "Reference data OK (city exists in target)."

# ─── Pre-fetch column metadata for all tables in a single query ──────────────
# This avoids repeated connections to the source database per table.
echo "Fetching column metadata from source..."
COLUMN_METADATA_FILE=$(mktemp)
ORPHAN_FK_METADATA_FILE=$(mktemp)
trap "rm -f $COLUMN_METADATA_FILE $ORPHAN_FK_METADATA_FILE" EXIT

# Get all columns for all tables in one query
psql --set ON_ERROR_STOP=on "$SOURCE" -t -A -F $'\t' -c "
    SELECT table_name, string_agg('\"' || column_name || '\"', ', ' ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public'
    GROUP BY table_name;
" > "$COLUMN_METADATA_FILE"
if [ $? -ne 0 ]; then
    echo -e "\033[31mERROR: Failed to fetch column metadata. Aborting.\033[0m"
    exit 1
fi

# Get all nullable FK columns pointing to User/auth tables in one query
psql --set ON_ERROR_STOP=on "$SOURCE" -t -A -F $'\t' -c "
    SELECT cl_child.relname, a.attname
    FROM pg_constraint con
    JOIN pg_class cl_child ON con.conrelid = cl_child.oid
    JOIN pg_class cl_parent ON con.confrelid = cl_parent.oid
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    WHERE con.contype = 'f'
      AND cl_parent.relname IN ('User', 'Account', 'Session', 'VerificationToken')
      AND NOT a.attnotnull;
" > "$ORPHAN_FK_METADATA_FILE"
if [ $? -ne 0 ]; then
    echo -e "\033[31mERROR: Failed to fetch FK metadata. Aborting.\033[0m"
    exit 1
fi
echo "Metadata OK."

# ─── Helper: copy a table with a WHERE clause ───────────────────────────────
# Uses COPY (SELECT ... WHERE ...) TO STDOUT | COPY ... FROM STDIN
# Also NULLs out FK columns pointing to tables we don't copy (User).
copy_filtered() {
    local TABLE="$1"
    local WHERE="$2"

    # Look up pre-fetched columns
    local ALL_COLUMNS
    ALL_COLUMNS=$(grep "^${TABLE}	" "$COLUMN_METADATA_FILE" | cut -f2-)
    if [ -z "$ALL_COLUMNS" ]; then
        echo "  $TABLE: not in source database (skipping)"
        return 0
    fi

    # Look up pre-fetched orphan FKs
    local SELECT_COLUMNS="$ALL_COLUMNS"
    local NULLED_COLS=""
    local ORPHAN_FKS
    ORPHAN_FKS=$(grep "^${TABLE}	" "$ORPHAN_FK_METADATA_FILE" | cut -f2-)

    if [ -n "$ORPHAN_FKS" ]; then
        while IFS= read -r col; do
            [ -z "$col" ] && continue
            SELECT_COLUMNS=$(echo "$SELECT_COLUMNS" | sed "s/\"$col\"/NULL AS \"$col\"/g")
            NULLED_COLS="$NULLED_COLS $col"
        done <<< "$ORPHAN_FKS"
    fi

    local COUNT
    COUNT=$(psql --set ON_ERROR_STOP=on "$SOURCE" -t -A -c "SELECT count(*) FROM \"$TABLE\" WHERE $WHERE;")

    if [ "$COUNT" = "0" ]; then
        echo "  $TABLE: 0 rows (skipping)"
        return 0
    fi

    local LABEL="$TABLE: $COUNT rows"
    if [ -n "$NULLED_COLS" ]; then
        LABEL="$LABEL (NULLing:$NULLED_COLS)"
    fi
    echo "  $LABEL"

    psql --set ON_ERROR_STOP=on "$SOURCE" -c "COPY (SELECT $SELECT_COLUMNS FROM \"$TABLE\" WHERE $WHERE) TO STDOUT" \
        | psql --set ON_ERROR_STOP=on "$TARGET" -c "COPY \"$TABLE\" ($ALL_COLUMNS) FROM STDIN"

    if [ $? -ne 0 ]; then
        echo -e "\033[31mERROR: Failed to copy $TABLE. Aborting.\033[0m"
        exit 1
    fi
}

# ─── Common subqueries ──────────────────────────────────────────────────────
MEETING_FILTER="\"cityId\" = '$CITY_ID' AND \"meetingId\" = '$MEETING_ID'"
MEETING_FILTER_CM="\"cityId\" = '$CITY_ID' AND \"councilMeetingId\" = '$MEETING_ID'"
SEGMENTS_SUBQ="SELECT id FROM \"SpeakerSegment\" WHERE $MEETING_FILTER"
SUBJECTS_SUBQ="SELECT id FROM \"Subject\" WHERE $MEETING_FILTER_CM"
UTTERANCES_SUBQ="SELECT id FROM \"Utterance\" WHERE \"speakerSegmentId\" IN ($SEGMENTS_SUBQ)"
HIGHLIGHTS_SUBQ="SELECT id FROM \"Highlight\" WHERE $MEETING_FILTER"
PODCAST_SPECS_SUBQ="SELECT id FROM \"PodcastSpec\" WHERE $MEETING_FILTER_CM"
PODCAST_PARTS_SUBQ="SELECT id FROM \"PodcastPart\" WHERE \"podcastSpecId\" IN ($PODCAST_SPECS_SUBQ)"
TASK_STATUSES_SUBQ="SELECT id FROM \"TaskStatus\" WHERE $MEETING_FILTER_CM"

# ─── Step 1: Delete existing meeting data in target (reverse dependency order)
echo ""
echo "Deleting existing data for this meeting in target..."

# Leaf tables first, then parents
DELETE_QUERIES=(
    # Deepest leaves
    "DELETE FROM \"PodcastPartAudioUtterance\" WHERE \"podcastPartId\" IN ($PODCAST_PARTS_SUBQ);"
    "DELETE FROM \"PodcastPart\" WHERE \"podcastSpecId\" IN ($PODCAST_SPECS_SUBQ);"
    "DELETE FROM \"PodcastSpec\" WHERE $MEETING_FILTER_CM;"
    "DELETE FROM \"HighlightedUtterance\" WHERE \"highlightId\" IN ($HIGHLIGHTS_SUBQ);"
    "DELETE FROM \"Highlight\" WHERE $MEETING_FILTER;"
    "DELETE FROM \"TopicLabel\" WHERE \"speakerSegmentId\" IN ($SEGMENTS_SUBQ);"
    "DELETE FROM \"Summary\" WHERE \"speakerSegmentId\" IN ($SEGMENTS_SUBQ);"
    "DELETE FROM \"SpeakerContribution\" WHERE \"subjectId\" IN ($SUBJECTS_SUBQ);"
    "DELETE FROM \"SubjectSpeakerSegment\" WHERE \"subjectId\" IN ($SUBJECTS_SUBQ);"
    "DELETE FROM \"Decision\" WHERE \"subjectId\" IN ($SUBJECTS_SUBQ);"
    "DELETE FROM \"SubjectAttendance\" WHERE \"subjectId\" IN ($SUBJECTS_SUBQ);"
    "DELETE FROM \"SubjectVote\" WHERE \"subjectId\" IN ($SUBJECTS_SUBQ);"
    "DELETE FROM \"MeetingAttendance\" WHERE $MEETING_FILTER_CM;"
    "DELETE FROM \"Utterance\" WHERE \"speakerSegmentId\" IN ($SEGMENTS_SUBQ);"
    "DELETE FROM \"Subject\" WHERE $MEETING_FILTER_CM;"
    "DELETE FROM \"SpeakerSegment\" WHERE $MEETING_FILTER;"
    "DELETE FROM \"TaskStatus\" WHERE $MEETING_FILTER_CM;"
    "DELETE FROM \"CouncilMeeting\" WHERE \"cityId\" = '$CITY_ID' AND id = '$MEETING_ID';"
)

for q in "${DELETE_QUERIES[@]}"; do
    psql --set ON_ERROR_STOP=on "$TARGET" -c "$q"
    if [ $? -ne 0 ]; then
        echo -e "\033[31mERROR: Delete failed. Query: $q\033[0m"
        exit 1
    fi
done
echo "Existing data deleted."

# ─── Step 2: Copy data (dependency order — parents first) ───────────────────
echo ""
echo "Copying meeting data..."

# The meeting itself
copy_filtered "CouncilMeeting" "\"cityId\" = '$CITY_ID' AND id = '$MEETING_ID'"

# Direct children of meeting
copy_filtered "SpeakerSegment" "$MEETING_FILTER"
copy_filtered "Subject" "$MEETING_FILTER_CM"
copy_filtered "TaskStatus" "$MEETING_FILTER_CM"
copy_filtered "Highlight" "$MEETING_FILTER"
copy_filtered "PodcastSpec" "$MEETING_FILTER_CM"
copy_filtered "MeetingAttendance" "$MEETING_FILTER_CM"

# Children of SpeakerSegment
copy_filtered "Utterance" "\"speakerSegmentId\" IN ($SEGMENTS_SUBQ)"
copy_filtered "TopicLabel" "\"speakerSegmentId\" IN ($SEGMENTS_SUBQ)"
copy_filtered "Summary" "\"speakerSegmentId\" IN ($SEGMENTS_SUBQ)"

# Children of Subject
copy_filtered "SubjectSpeakerSegment" "\"subjectId\" IN ($SUBJECTS_SUBQ)"
copy_filtered "SpeakerContribution" "\"subjectId\" IN ($SUBJECTS_SUBQ)"
copy_filtered "Decision" "\"subjectId\" IN ($SUBJECTS_SUBQ)"
copy_filtered "SubjectAttendance" "\"subjectId\" IN ($SUBJECTS_SUBQ)"
copy_filtered "SubjectVote" "\"subjectId\" IN ($SUBJECTS_SUBQ)"

# Children of Utterance (no Words)
copy_filtered "HighlightedUtterance" "\"utteranceId\" IN ($UTTERANCES_SUBQ)"

# Children of PodcastSpec
copy_filtered "PodcastPart" "\"podcastSpecId\" IN ($PODCAST_SPECS_SUBQ)"
copy_filtered "PodcastPartAudioUtterance" "\"podcastPartId\" IN ($PODCAST_PARTS_SUBQ)"

echo ""
echo -e "\033[32mDone! Meeting \"$MEETING_NAME\" copied successfully.\033[0m"
