/*
  Warnings:

  - You are about to drop the column `isAdministrativeRole` on the `Person` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `Person` table. All the data in the column will be lost.
  - You are about to drop the column `role_en` on the `Person` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Person" DROP COLUMN "isAdministrativeRole",
DROP COLUMN "role",
DROP COLUMN "role_en";
