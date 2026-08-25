# Shared list of content tables — sourced by copy_db.sh and setup_db_role.sh.
# These are public content tables (no auth data, no task state). A content table
# can hold a nullable foreign key to an excluded table, for example
# UtteranceEdit.userId — copy_db.sh sets those columns to NULL as it copies.
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
    "DecisionCandidate"
    "SubjectAttendance"
    "SubjectVote"
    "MeetingAttendance"
    "SpeakerSegment"
    "SpeakerContribution"
    "Utterance"
    "UtteranceEdit"
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
