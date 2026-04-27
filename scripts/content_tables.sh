# Shared list of content tables — sourced by copy_db.sh and setup_db_role.sh.
# These are public content tables (no user data, no auth, no task state).
# When adding a new content table, add it here and both scripts pick it up.
# Order matters: copy_db.sh copies in this order, so a table must appear after
# every table it references by foreign key.
CONTENT_TABLES=(
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
    "SubjectAttendance"
    "SubjectVote"
    "MeetingAttendance"
    "SpeakerSegment"
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
