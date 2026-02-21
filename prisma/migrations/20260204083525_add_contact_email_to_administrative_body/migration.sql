-- AlterTable
ALTER TABLE "AdministrativeBody" ADD COLUMN     "contactEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
