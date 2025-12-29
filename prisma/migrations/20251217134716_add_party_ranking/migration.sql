-- CreateEnum
CREATE TYPE "PeopleOrdering" AS ENUM ('default', 'partyRank');

-- AlterTable
ALTER TABLE "City" ADD COLUMN "peopleOrdering" "PeopleOrdering" NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "Role" ADD COLUMN "rank" INTEGER;

