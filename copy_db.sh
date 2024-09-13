#!/bin/bash

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
RANDOM_STRING=$(openssl rand -base64 6 | tr -dc 'A-Za-z0-9' | head -c 6)

# Display warning message
if [ "$CLEAR" = true ]; then
    echo -e "\033[31mPotential data loss -- this will delete all data from destination tables and copy data from $SOURCE to $TARGET. Enter $RANDOM_STRING to continue.\033[0m"
else
    echo -e "\033[31mThis will copy data from $SOURCE to $TARGET. Enter $RANDOM_STRING to continue.\033[0m"
fi

# Prompt for confirmation
read -p "Enter the confirmation code: " CONFIRMATION

if [ "$CONFIRMATION" != "$RANDOM_STRING" ]; then
    echo "Confirmation failed. Exiting."
    exit 1
fi

# Array of table names
TABLES=("City" "Party" "Person" "CouncilMeeting" "TaskStatus" "SpeakerTag" "SpeakerSegment" "Utterance" "Word" "TopicLabel" "Topic" "Summary")

# Delete all rows from destination tables if --clear flag is set
if [ "$CLEAR" = true ]; then
    for TABLE in "${TABLES[@]}"; do
        echo "Deleting all rows from $TABLE"
        psql "$TARGET" -c "DELETE FROM \"$TABLE\";"
    done
fi

# Proceed with data copying
for TABLE in "${TABLES[@]}"; do
    echo "Copying data for $TABLE"
    pg_dump --data-only -t "\"$TABLE\"" "$SOURCE" | psql "$TARGET"
done
