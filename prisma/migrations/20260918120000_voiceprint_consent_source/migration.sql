-- A superadmin can record a consent that the person gave outside the app.
-- Every existing period came from the person's own account.
CREATE TYPE "VoicePrintConsentSource" AS ENUM ('PERSON', 'ADMIN');
ALTER TABLE "VoicePrintConsent" ADD COLUMN "source" "VoicePrintConsentSource" NOT NULL DEFAULT 'PERSON';
