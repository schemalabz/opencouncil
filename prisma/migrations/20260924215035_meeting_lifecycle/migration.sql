-- Meeting lifecycle and record (#150): the schedule status, the kind, the
-- session number, the format and the place of a meeting, and the links for a
-- postponement and a continuation.
BEGIN;

-- CreateEnum
CREATE TYPE "MeetingScheduleStatus" AS ENUM ('scheduled', 'postponed', 'cancelled');

-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('regular', 'urgent', 'accountability', 'annualReport', 'budget', 'presidencyElection');

-- CreateEnum
CREATE TYPE "MeetingFormat" AS ENUM ('inPerson', 'teleconference', 'mixed', 'byCirculation');

-- AlterTable
ALTER TABLE "AdministrativeBody" ADD COLUMN     "place" TEXT;

-- AlterTable
ALTER TABLE "CouncilMeeting" ADD COLUMN     "closedToPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "continuationOfId" TEXT,
ADD COLUMN     "format" "MeetingFormat" NOT NULL DEFAULT 'inPerson',
ADD COLUMN     "kind" "MeetingKind",
ADD COLUMN     "place" TEXT,
ADD COLUMN     "postponedFromId" TEXT,
ADD COLUMN     "scheduleStatus" "MeetingScheduleStatus" NOT NULL DEFAULT 'scheduled',
ADD COLUMN     "scheduleStatusReason" TEXT,
ADD COLUMN     "sessionNumber" INTEGER;

-- CreateIndex
CREATE INDEX "CouncilMeeting_cityId_continuationOfId_idx" ON "CouncilMeeting"("cityId", "continuationOfId");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilMeeting_cityId_postponedFromId_key" ON "CouncilMeeting"("cityId", "postponedFromId");

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_cityId_postponedFromId_fkey" FOREIGN KEY ("cityId", "postponedFromId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_cityId_continuationOfId_fkey" FOREIGN KEY ("cityId", "continuationOfId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Prisma cannot express these checks. Each one has a name, so that a test can
-- find it in pg_constraint.
ALTER TABLE "CouncilMeeting"
  ADD CONSTRAINT "CouncilMeeting_sessionNumber_positive"
    CHECK ("sessionNumber" IS NULL OR "sessionNumber" > 0),
  ADD CONSTRAINT "CouncilMeeting_not_own_postponedFrom"
    CHECK ("postponedFromId" IS NULL OR "postponedFromId" <> "id"),
  ADD CONSTRAINT "CouncilMeeting_not_own_continuationOf"
    CHECK ("continuationOfId" IS NULL OR "continuationOfId" <> "id"),
  -- A later part carries neither number nor kind: the first part holds them.
  ADD CONSTRAINT "CouncilMeeting_continuation_owns_nothing"
    CHECK ("continuationOfId" IS NULL OR ("sessionNumber" IS NULL AND "kind" IS NULL));

-- Decision polling skips λογοδοσία meetings. Until now it matched the stored
-- name; from now on it reads the kind. So the kind of the existing λογοδοσία
-- meetings is set here, in the same transaction as the column. Records that
-- also hold a regular meeting («Λογοδοσία και Δημοτικό Συμβούλιο …») keep a
-- null kind: their regular part produces decisions (#209). The patterns are
-- case-sensitive on purpose: case folding of Greek depends on the collation.
UPDATE "CouncilMeeting" cm
SET "kind" = 'accountability'
WHERE cm."kind" IS NULL
  AND cm."name" ~ '(Λογοδοσ|λογοδοσ|ΛΟΓΟΔΟΣ)'
  AND cm."name" !~ '( και | & |[Ττ]ακτικ|ΤΑΚΤΙΚ|[Δδ]ημοτικ[όο] [Σσ]υμβούλιο|ΔΗΜΟΤΙΚΟ ΣΥΜΒΟΥΛΙΟ)'
  AND (
    cm."administrativeBodyId" IS NULL
    OR EXISTS (
      SELECT 1 FROM "AdministrativeBody" ab
      WHERE ab.id = cm."administrativeBodyId" AND ab.type = 'council'
    )
  );

COMMIT;
