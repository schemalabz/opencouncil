-- Decision facts: what each body writes (conventions), what each document states
-- (Decision columns, AttendanceEvent), derived once in the app.

ALTER TABLE "AdministrativeBody" ADD COLUMN "decisionConventions" JSONB;

CREATE TYPE "AttendanceEventKind" AS ENUM ('ARRIVAL', 'DEPARTURE');
CREATE TYPE "AttendanceAnchorKind" AS ENUM ('AGENDA_ITEM', 'DECISION_NUMBER', 'SUBJECT', 'PHASE', 'SESSION_START', 'SESSION_END');
CREATE TYPE "AttendancePhase" AS ENUM ('PRE_AGENDA', 'OUT_OF_AGENDA');
CREATE TYPE "AttendanceTiming" AS ENUM ('BEFORE', 'DURING', 'AFTER');

CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "councilMeetingId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "AttendanceEventKind" NOT NULL,
    "anchorKind" "AttendanceAnchorKind" NOT NULL,
    "anchorAgendaItemIndex" INTEGER,
    "anchorNonAgendaReason" "NonAgendaReason",
    "anchorDecisionNumber" TEXT,
    "anchorSubjectId" TEXT,
    "anchorPhase" "AttendancePhase",
    "timing" "AttendanceTiming",
    "rawText" TEXT NOT NULL,
    "reportingDocuments" INTEGER NOT NULL DEFAULT 1,
    "totalDocuments" INTEGER NOT NULL DEFAULT 1,
    "source" "DataSource" NOT NULL,
    "taskId" TEXT,
    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AttendanceEvent_councilMeetingId_cityId_idx" ON "AttendanceEvent"("councilMeetingId", "cityId");
CREATE INDEX "AttendanceEvent_personId_idx" ON "AttendanceEvent"("personId");
CREATE INDEX "AttendanceEvent_anchorSubjectId_idx" ON "AttendanceEvent"("anchorSubjectId");
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_cityId_councilMeetingId_fkey" FOREIGN KEY ("cityId", "councilMeetingId") REFERENCES "CouncilMeeting"("cityId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_anchorSubjectId_fkey" FOREIGN KEY ("anchorSubjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Decision"
    ADD COLUMN "voteResultPhrase" TEXT,
    ADD COLUMN "mayorPresent" BOOLEAN,
    ADD COLUMN "declaredItemNumber" INTEGER,
    ADD COLUMN "declaredOutOfAgenda" BOOLEAN,
    ADD COLUMN "incomplete" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "unmatchedNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "extractorVersion" TEXT,
    ADD COLUMN "extraction" JSONB;
