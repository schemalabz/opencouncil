-- CreateEnum
CREATE TYPE "LastModifiedBy" AS ENUM ('user', 'task');

-- AlterTable
ALTER TABLE "Utterance" ADD COLUMN     "lastModifiedBy" "LastModifiedBy";
