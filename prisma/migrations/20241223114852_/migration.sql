-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "agendaItemIndex" INTEGER,
ADD COLUMN     "hot" BOOLEAN NOT NULL DEFAULT false;
