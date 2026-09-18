-- Voiceprint consent as a period, with the account that gave it. A
-- withdrawal closes the period; nothing deletes one. The previous shape
-- (one row per person, deleted on withdrawal) was never merged and held no
-- rows; a preview database that applied it drops it here.
DROP TABLE IF EXISTS "PersonVoicePrintConsent";

CREATE TABLE "VoicePrintConsent" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "userId" TEXT,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),

    CONSTRAINT "VoicePrintConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoicePrintConsent_personId_givenAt_idx" ON "VoicePrintConsent"("personId", "givenAt");

-- At most one open period per person, and a period that does not end before
-- it starts. Not strictly after: the grant time is the database default and
-- the withdrawal time is the app's clock, and a withdrawal right after a
-- grant must not fail on the difference between the two.
CREATE UNIQUE INDEX "VoicePrintConsent_open_key" ON "VoicePrintConsent"("personId") WHERE "withdrawnAt" IS NULL;
ALTER TABLE "VoicePrintConsent" ADD CONSTRAINT "VoicePrintConsent_period_valid" CHECK ("withdrawnAt" IS NULL OR "withdrawnAt" >= "givenAt");

-- A deleted person takes its periods with its voiceprints. A deleted account
-- leaves them: the proof that processing was lawful outlives the account.
ALTER TABLE "VoicePrintConsent" ADD CONSTRAINT "VoicePrintConsent_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VoicePrintConsent" ADD CONSTRAINT "VoicePrintConsent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "This account is this person", set by a QR claim. One claimed account per
-- person; delegate rows (no claimedAt) stay unlimited.
ALTER TABLE "Administers" ADD COLUMN "claimedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Administers_claimed_person_key" ON "Administers"("personId") WHERE "claimedAt" IS NOT NULL;
