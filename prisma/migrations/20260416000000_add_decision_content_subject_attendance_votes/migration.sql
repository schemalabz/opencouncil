-- AlterTable: Add extracted PDF content fields to Decision
ALTER TABLE "Decision" ADD COLUMN "excerpt" TEXT;
ALTER TABLE "Decision" ADD COLUMN "references" TEXT;

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('FOR', 'AGAINST', 'ABSTAIN');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('decision', 'transcript', 'manual');

-- CreateTable
CREATE TABLE "SubjectAttendance" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subjectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "source" "DataSource" NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "SubjectAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectVote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "subjectId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "voteType" "VoteType" NOT NULL,
    "source" "DataSource" NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "SubjectVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubjectAttendance_subjectId_idx" ON "SubjectAttendance"("subjectId");
CREATE INDEX "SubjectAttendance_personId_idx" ON "SubjectAttendance"("personId");
CREATE UNIQUE INDEX "SubjectAttendance_subjectId_personId_source_key" ON "SubjectAttendance"("subjectId", "personId", "source");

-- CreateIndex
CREATE INDEX "SubjectVote_subjectId_idx" ON "SubjectVote"("subjectId");
CREATE INDEX "SubjectVote_personId_idx" ON "SubjectVote"("personId");
CREATE UNIQUE INDEX "SubjectVote_subjectId_personId_source_key" ON "SubjectVote"("subjectId", "personId", "source");

-- AddForeignKey
ALTER TABLE "SubjectAttendance" ADD CONSTRAINT "SubjectAttendance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectAttendance" ADD CONSTRAINT "SubjectAttendance_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectAttendance" ADD CONSTRAINT "SubjectAttendance_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubjectAttendance" ADD CONSTRAINT "SubjectAttendance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectVote" ADD CONSTRAINT "SubjectVote_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectVote" ADD CONSTRAINT "SubjectVote_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubjectVote" ADD CONSTRAINT "SubjectVote_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TaskStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubjectVote" ADD CONSTRAINT "SubjectVote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
