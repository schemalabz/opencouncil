-- The person's own consent to a voiceprint, as a row: present means given,
-- and consentedAt says when. Its own table so that no public read of a
-- person carries it.
CREATE TABLE "PersonVoicePrintConsent" (
    "personId" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonVoicePrintConsent_pkey" PRIMARY KEY ("personId")
);

ALTER TABLE "PersonVoicePrintConsent" ADD CONSTRAINT "PersonVoicePrintConsent_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
