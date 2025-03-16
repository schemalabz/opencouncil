-- CreateEnum
CREATE TYPE "NonAgendaReason" AS ENUM ('beforeAgenda', 'outOfAgenda');

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "nonAgendaReason" "NonAgendaReason";
