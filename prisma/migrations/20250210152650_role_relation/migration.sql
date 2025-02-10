-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "cityId" TEXT,
    "partyId" TEXT,
    "administrativeBodyId" TEXT,
    "isHead" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_personId_idx" ON "Role"("personId");

-- CreateIndex
CREATE INDEX "Role_cityId_idx" ON "Role"("cityId");

-- CreateIndex
CREATE INDEX "Role_partyId_idx" ON "Role"("partyId");

-- CreateIndex
CREATE INDEX "Role_administrativeBodyId_idx" ON "Role"("administrativeBodyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_personId_cityId_partyId_administrativeBodyId_key" ON "Role"("personId", "cityId", "partyId", "administrativeBodyId");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_administrativeBodyId_fkey" FOREIGN KEY ("administrativeBodyId") REFERENCES "AdministrativeBody"("id") ON DELETE CASCADE ON UPDATE CASCADE;
