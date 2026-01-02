#!/usr/bin/env bash

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

# Array of tables -- we only copy tables that don't have user data.
TABLES=(
    "City"
    "Topic" 
    "Location"
    "Party"
    "AdministrativeBody"
    "Person"
    "Role"
    "CouncilMeeting"
    "TaskStatus"
    "SpeakerTag"
    "SpeakerSegment"
    "Utterance"
    "Word"
    "TopicLabel"
    "Summary"
    "Subject"
    "SubjectSpeakerSegment"
    "Highlight"
    "HighlightedUtterance"
    "PodcastSpec"
    "PodcastPart"
    "PodcastPartAudioUtterance"
    "Offer"
    "VoicePrint"
    "CityMessage"
    "Consultation"
    "QrCampaign"
)

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
