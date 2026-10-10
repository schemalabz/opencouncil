-- An admin of one administrative body (#828): a fourth scope next to city,
-- party and person. The unique key gains the new column so one account holds
-- one row per body.
ALTER TABLE "Administers" ADD COLUMN "administrativeBodyId" TEXT;

ALTER TABLE "Administers" ADD CONSTRAINT "Administers_administrativeBodyId_fkey" FOREIGN KEY ("administrativeBodyId") REFERENCES "AdministrativeBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Administers_userId_cityId_partyId_personId_key";

-- The name is what Prisma expects: Postgres truncates identifiers to 63 characters.
CREATE UNIQUE INDEX "Administers_userId_cityId_partyId_personId_administrativeBo_key" ON "Administers"("userId", "cityId", "partyId", "personId", "administrativeBodyId");

-- The key above never rejects a duplicate body row, because its other columns
-- are NULL and Postgres treats NULLs as distinct. One row per account and body.
CREATE UNIQUE INDEX "Administers_user_body_key" ON "Administers"("userId", "administrativeBodyId") WHERE "administrativeBodyId" IS NOT NULL;
