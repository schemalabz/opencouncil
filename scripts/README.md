# Database Hydration Scripts

Scripts for copying production data to development/staging databases.

## Usage

```bash
# Copy all data from production to your dev database
./scripts/hydrate.sh christos-devdb

# Other targets
./scripts/hydrate.sh andreas-devdb
./scripts/hydrate.sh staging
```

The script will ask for a confirmation code before copying data.

## What Gets Copied

The script copies these 27 tables:
- City, Topic, Location
- Party, AdministrativeBody, Person, Role
- CouncilMeeting
- SpeakerTag, SpeakerSegment, Utterance, Word
- TopicLabel, Summary
- Subject, SubjectSpeakerSegment, SpeakerContribution
- Highlight, HighlightedUtterance
- PodcastSpec, PodcastPart, PodcastPartAudioUtterance
- Offer, VoicePrint
- CityMessage, Consultation, QrCampaign

## What Gets Excluded

The hydration scripts **never** copy:
- User accounts and authentication data (User, Account, Session, VerificationToken, Authenticator)
- User-generated content (Petition, ConsultationComment, ConsultationCommentUpvote)
- Notification preferences and deliveries
- Administrative relationships (Administers)
- Edit history (UtteranceEdit)
- Task statuses (TaskStatus)

## Performance

Full hydration takes ~30-60 minutes and copies ~50GB of data.

## Safety Features

1. **Confirmation Required**: You must enter a confirmation code before data is copied
2. **Clear Flag**: The `--clear` flag is always used to ensure clean state
3. **Warning Messages**: Clear warnings about data loss potential
4. **No PII**: User data is never copied
