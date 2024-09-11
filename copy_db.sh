#!/bin/bash

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --source=*) SOURCE="${1#*=}" ;;
        --target=*) TARGET="${1#*=}" ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

# Check if source and target are provided
if [ -z "$SOURCE" ] || [ -z "$TARGET" ]; then
    echo "Usage: $0 --source=postgresql://... --target=postgresql://..."
    exit 1
fi

# Generate random string
RANDOM_STRING=$(openssl rand -base64 6 | tr -dc 'A-Za-z0-9' | head -c 6)

# Display warning message
echo -e "\033[31mPotential data loss -- this will copy data from $SOURCE to $TARGET. Enter $RANDOM_STRING to continue.\033[0m"

# Prompt for confirmation
read -p "Enter the confirmation code: " CONFIRMATION

if [ "$CONFIRMATION" != "$RANDOM_STRING" ]; then
    echo "Confirmation failed. Exiting."
    exit 1
fi

# Proceed with data copying
pg_dump --data-only -t '"City"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"Party"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"Person"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"CouncilMeeting"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"TaskStatus"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"SpeakerTag"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"SpeakerSegment"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"Utterance"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"Word"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"TopicLabel"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"Topic"' "$SOURCE" | psql "$TARGET"
pg_dump --data-only -t '"Summary"' "$SOURCE" | psql "$TARGET"
