-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jsonUrl" TEXT NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cityId" TEXT NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consultation_cityId_isActive_idx" ON "Consultation"("cityId", "isActive");

-- CreateIndex
CREATE INDEX "Consultation_isActive_endDate_idx" ON "Consultation"("isActive", "endDate");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
