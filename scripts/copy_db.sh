#!/usr/bin/env bash
set -o pipefail

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --source=*) SOURCE="${1#*=}" ;;
        --target=*) TARGET="${1#*=}" ;;
        --clear) CLEAR=true ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

# Check if source and target are provided
if [ -z "$SOURCE" ] || [ -z "$TARGET" ]; then
    echo "Usage: $0 --source=postgresql://... --target=postgresql://... [--clear]"
    exit 1
fi

# Generate random string
RANDOM_STRING=$(openssl rand -base64 6 | tr -dc 'A-Za-z0-9' | head -c 3)
# Extract the database name from the target URL
TARGET_DB_NAME=$(echo $TARGET | sed -n 's#.*/\([^/?]*\).*#\1#p')

# Generate confirmation code
CONFIRMATION_CODE="DELETE-${TARGET_DB_NAME}-$RANDOM_STRING"

# Display warning message
if [ "$CLEAR" = true ]; then
    echo -e "\033[31mPotential data loss -- this will delete all data from destination tables and copy data\n\tfrom $SOURCE\n\tto $TARGET\n\nEnter $CONFIRMATION_CODE to continue.\033[0m"
else
    echo -e "\033[31mThis will copy data from $SOURCE to $TARGET. Enter $CONFIRMATION_CODE to continue.\033[0m"
fi

# Prompt for confirmation
read -p "Enter the confirmation code: " CONFIRMATION

if [ "$CONFIRMATION" != "$CONFIRMATION_CODE" ]; then
    echo "Confirmation failed. Exiting."
    exit 1
fi

# Array of tables -- we only copy tables that don't have user data or tasks.
TABLES=(
    "City"
    "Topic"
    "Location"
    "Party"
    "AdministrativeBody"
    "Person"
    "Role"
    "CouncilMeeting"
    "SpeakerTag"
    "Subject"
    "Decision"
    "SpeakerSegment"
    "SubjectSpeakerSegment"
    "SpeakerContribution"
    "Utterance"
    "Word"
    "TopicLabel"
    "Summary"
    "Highlight"
    "HighlightedUtterance"
    "Offer"
    "VoicePrint"
    "CityMessage"
    "Consultation"
    "QrCampaign"
)

# Verify the target database has all migrations that the source has.
# The target may have extra migrations (e.g. feature branch), but must not be
# missing any from the source — otherwise pg_dump's COPY will reference columns
# that don't exist in the target.
echo "Checking migration state..."
SOURCE_MIGRATIONS=$(psql "$SOURCE" -t -A -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at;")
SOURCE_PSQL_EXIT=$?
TARGET_MIGRATIONS=$(psql "$TARGET" -t -A -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at;")
TARGET_PSQL_EXIT=$?
if [ $SOURCE_PSQL_EXIT -ne 0 ] || [ $TARGET_PSQL_EXIT -ne 0 ] || [ -z "$SOURCE_MIGRATIONS" ] || [ -z "$TARGET_MIGRATIONS" ]; then
    echo -e "\033[31mCould not read migration state from one or both databases. Aborting.\033[0m"
    [ $SOURCE_PSQL_EXIT -ne 0 ] && echo -e "\033[31m  Source query failed (exit $SOURCE_PSQL_EXIT)\033[0m"
    [ $TARGET_PSQL_EXIT -ne 0 ] && echo -e "\033[31m  Target query failed (exit $TARGET_PSQL_EXIT)\033[0m"
    exit 1
fi

MISSING_MIGRATIONS=()
while IFS= read -r migration; do
    if ! grep -qxF "$migration" <<< "$TARGET_MIGRATIONS"; then
        MISSING_MIGRATIONS+=("$migration")
    fi
done <<< "$SOURCE_MIGRATIONS"

if [ ${#MISSING_MIGRATIONS[@]} -gt 0 ]; then
    echo -e "\033[31mTarget is missing ${#MISSING_MIGRATIONS[@]} migration(s) that exist in source:\033[0m"
    for m in "${MISSING_MIGRATIONS[@]}"; do
        echo -e "\033[31m  - $m\033[0m"
    done
    echo -e "\033[31mRun migrations on the target database before copying. Aborting.\033[0m"
    exit 1
fi
echo "Migration state OK (target has all source migrations)."

# Validate that TABLES order respects foreign key dependencies in the source database.
# For each table, check that any table it references (via FK) appears earlier in the list.
# Run this BEFORE --clear deletion so we never wipe data if the order is wrong.
echo "Validating table order against foreign key dependencies..."

# Helper: get index of a table in TABLES array (prints index or empty string if not found)
table_index() {
    local name="$1"
    for i in "${!TABLES[@]}"; do
        if [ "${TABLES[$i]}" = "$name" ]; then
            echo "$i"
            return
        fi
    done
    echo ""
}

FK_VALIDATION_OUTPUT=$(psql --set ON_ERROR_STOP=on "$SOURCE" -t -A -F $'\t' -c "
    SELECT
        cl_child.relname AS child_table,
        cl_parent.relname AS parent_table
    FROM pg_constraint con
    JOIN pg_class cl_child ON con.conrelid = cl_child.oid
    JOIN pg_class cl_parent ON con.confrelid = cl_parent.oid
    WHERE con.contype = 'f'
      AND cl_child.relname != cl_parent.relname
    ORDER BY cl_child.relname;
")
if [ $? -ne 0 ]; then
    echo -e "\033[31mFailed to query foreign key constraints from source database. Aborting.\033[0m"
    exit 1
fi

FK_ERRORS=0
while IFS=$'\t' read -r child parent; do
    # Skip FK references to tables not in our copy list (e.g. User)
    parent_idx=$(table_index "$parent")
    if [ -z "$parent_idx" ]; then
        continue
    fi
    child_idx=$(table_index "$child")
    if [ -z "$child_idx" ]; then
        continue
    fi
    if [ "$child_idx" -lt "$parent_idx" ]; then
        echo -e "\033[31mFK ordering error: \"$child\" (position $child_idx) references \"$parent\" (position $parent_idx) — \"$parent\" must come first.\033[0m"
        FK_ERRORS=$((FK_ERRORS + 1))
    fi
done <<< "$FK_VALIDATION_OUTPUT"

if [ "$FK_ERRORS" -gt 0 ]; then
    echo -e "\033[31mFound $FK_ERRORS FK ordering error(s). Fix the TABLES array order before proceeding.\033[0m"
    exit 1
fi
echo "Table order is valid."

# Find nullable FK columns that reference tables NOT in our copy list (e.g. User).
# Since we intentionally exclude user data for privacy, these columns must be NULLed
# during copy to avoid FK violations against non-existent rows.
# NULLIFY_COLUMNS: stored as a temp file with lines "TABLE COL1 COL2 ..."
NULLIFY_COLUMNS_FILE=$(mktemp)
trap "rm -f $NULLIFY_COLUMNS_FILE" EXIT

# Helper: get columns to nullify for a table (empty string if none)
get_nullify_columns() {
    local tbl="$1"
    local line
    line=$(grep "^${tbl}	" "$NULLIFY_COLUMNS_FILE" 2>/dev/null) || true
    if [ -n "$line" ]; then
        echo "${line#*	}"
    fi
}

# Helper: set/append columns to nullify for a table
add_nullify_column() {
    local tbl="$1" col="$2"
    local existing
    existing=$(get_nullify_columns "$tbl")
    # Remove existing entry if present
    grep -v "^${tbl}	" "$NULLIFY_COLUMNS_FILE" > "${NULLIFY_COLUMNS_FILE}.tmp" 2>/dev/null || true
    mv "${NULLIFY_COLUMNS_FILE}.tmp" "$NULLIFY_COLUMNS_FILE"
    if [ -n "$existing" ]; then
        echo "${tbl}	${existing} ${col}" >> "$NULLIFY_COLUMNS_FILE"
    else
        echo "${tbl}	${col}" >> "$NULLIFY_COLUMNS_FILE"
    fi
}

ORPHAN_FK_OUTPUT=$(psql --set ON_ERROR_STOP=on "$SOURCE" -t -A -F $'\t' -c "
    SELECT
        cl_child.relname,
        a.attname,
        cl_parent.relname,
        CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END
    FROM pg_constraint con
    JOIN pg_class cl_child ON con.conrelid = cl_child.oid
    JOIN pg_class cl_parent ON con.confrelid = cl_parent.oid
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    WHERE con.contype = 'f' AND cl_child.relname != cl_parent.relname;
")
if [ $? -ne 0 ]; then
    echo -e "\033[31mFailed to query orphan FK columns. Aborting.\033[0m"
    exit 1
fi
while IFS=$'\t' read -r child_table col_name parent_table is_nullable; do
    [ -z "$child_table" ] && continue
    # Only care about tables we're copying that reference tables we're NOT copying
    child_idx=$(table_index "$child_table")
    if [ -z "$child_idx" ]; then continue; fi
    parent_idx=$(table_index "$parent_table")
    if [ -n "$parent_idx" ]; then continue; fi
    if [ "$is_nullable" != "YES" ]; then
        echo -e "\033[31mERROR: \"$child_table\".\"$col_name\" has a non-nullable FK to \"$parent_table\" which is not being copied. Cannot proceed.\033[0m"
        exit 1
    fi
    add_nullify_column "$child_table" "$col_name"
done <<< "$ORPHAN_FK_OUTPUT"

while IFS=$'\t' read -r tbl cols; do
    [ -z "$tbl" ] && continue
    echo "Note: will NULL out [$cols] in \"$tbl\" (FK to non-copied table)"
done < "$NULLIFY_COLUMNS_FILE"

# Delete all rows from destination tables if --clear flag is set
if [ "$CLEAR" = true ]; then
    for TABLE in "${TABLES[@]}"; do
        echo "Deleting all rows from $TABLE"
        psql --set ON_ERROR_STOP=on "$TARGET" -c "DELETE FROM \"$TABLE\";"
        if [ $? -ne 0 ]; then
            echo -e "\033[31mERROR: Failed to delete from $TABLE. Aborting.\033[0m"
            exit 1
        fi
    done
fi

# Proceed with data copying
for TABLE in "${TABLES[@]}"; do
    COLS_TO_NULL=$(get_nullify_columns "$TABLE")
    if [ -n "$COLS_TO_NULL" ]; then
        # Table has FK columns pointing to non-copied tables — use custom SELECT that NULLs them
        echo "Copying data for $TABLE (NULLing: $COLS_TO_NULL)"

        # Build SELECT: replace each column-to-NULL with "NULL AS col", keep the rest
        ALL_COLUMNS=$(psql --set ON_ERROR_STOP=on "$SOURCE" -t -A -c "
            SELECT string_agg('\"' || column_name || '\"', ', ' ORDER BY ordinal_position)
            FROM information_schema.columns
            WHERE table_name = '$TABLE' AND table_schema = 'public';
        ")
        if [ $? -ne 0 ] || [ -z "$ALL_COLUMNS" ]; then
            echo -e "\033[31mERROR: Failed to retrieve column list for $TABLE. Aborting.\033[0m"
            exit 1
        fi
        SELECT_COLUMNS="$ALL_COLUMNS"
        for col in $COLS_TO_NULL; do
            SELECT_COLUMNS=$(echo "$SELECT_COLUMNS" | sed "s/\"$col\"/NULL AS \"$col\"/g")
        done

        psql --set ON_ERROR_STOP=on "$SOURCE" -c "COPY (SELECT $SELECT_COLUMNS FROM \"$TABLE\") TO STDOUT" \
            | psql --set ON_ERROR_STOP=on "$TARGET" -c "COPY \"$TABLE\" ($ALL_COLUMNS) FROM STDIN"
    else
        echo "Copying data for $TABLE"
        pg_dump --data-only -t "\"$TABLE\"" "$SOURCE" | psql --set ON_ERROR_STOP=on "$TARGET"
    fi
    if [ $? -ne 0 ]; then
        echo -e "\033[31mERROR: Failed to copy $TABLE. Aborting.\033[0m"
        exit 1
    fi
done
