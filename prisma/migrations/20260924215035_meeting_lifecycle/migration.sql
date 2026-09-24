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

-- The stored name becomes an override. Null means that the name is derived
-- from the body, the kind and the date (src/lib/meetingName.ts).
ALTER TABLE "CouncilMeeting"
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "name_en" DROP NOT NULL;

-- The derived name for the readers that are SQL, not TypeScript. It gives the
-- same string as meetingDisplayName(meeting, 'el', timezone) for a Greek city,
-- and it also reads an empty override as no override;
-- an integration test compares the two. Other languages get the body and the
-- date. "dateTime" is a timestamp without zone that holds UTC, so it is read
-- as UTC before the conversion to the city's zone. STABLE, not IMMUTABLE: the
-- conversion depends on the timezone database.
CREATE OR REPLACE FUNCTION council_meeting_display_name(
  override text,
  kind "MeetingKind",
  body_name text,
  held_at timestamp,
  tz text,
  lang text
) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(override, ''),
    COALESCE(body_name, CASE WHEN lang = 'el' THEN 'Συνεδρίαση' ELSE 'Meeting' END)
    || CASE
         WHEN lang IS DISTINCT FROM 'el' OR kind IS NULL OR kind = 'regular' THEN ''
         WHEN kind = 'urgent'             THEN ' — Έκτακτη Συνεδρίαση'
         WHEN kind = 'accountability'     THEN ' — Ειδική Συνεδρίαση Λογοδοσίας'
         WHEN kind = 'annualReport'       THEN ' — Ειδική Συνεδρίαση Απολογισμού'
         WHEN kind = 'budget'             THEN ' — Ειδική Συνεδρίαση Προϋπολογισμού'
         WHEN kind = 'presidencyElection' THEN ' — Ειδική Συνεδρίαση Εκλογής Προεδρείου'
         ELSE ''
       END
    || ' ' || to_char((held_at AT TIME ZONE 'UTC') AT TIME ZONE tz, 'DD/MM/YYYY')
  )
$$;

-- Notis reads the meeting name from this view, and its consumer model
-- declares the column non-null. The columns and their types do not change.
CREATE OR REPLACE VIEW "notis_meeting_events" AS
SELECT
  ts.id              AS "taskId",
  ts.type,
  ts."updatedAt"     AS "completedAt",
  ts."cityId",
  ts."councilMeetingId" AS "meetingId",
  council_meeting_display_name(cm.name, cm.kind, ab.name, cm."dateTime", c.timezone, c.language::text) AS "meetingName",
  cm."dateTime"      AS "meetingDate",
  cm.released,
  ab.name            AS "adminBodyName",
  c.realm::text      AS realm,
  c.language::text   AS language,
  c.timezone
FROM "TaskStatus" ts
JOIN "CouncilMeeting" cm ON cm."cityId" = ts."cityId" AND cm.id = ts."councilMeetingId"
JOIN "City" c ON c.id = ts."cityId"
LEFT JOIN "AdministrativeBody" ab ON ab.id = cm."administrativeBodyId"
WHERE ts.type IN ('processAgenda', 'summarize')
  AND ts.status = 'succeeded';

COMMIT;
