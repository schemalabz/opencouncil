-- A transcript identification of a speaker who is not on the roster (a
-- resident, an employee, a representative) has no person to point at. It
-- carries the speaker's label in "name" instead, with "personId" null.

-- AlterTable
ALTER TABLE "SpeakerIdentification" ADD COLUMN     "name" TEXT,
ALTER COLUMN "personId" DROP NOT NULL;
