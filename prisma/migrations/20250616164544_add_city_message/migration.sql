-- CreateTable
CREATE TABLE "CityMessage" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "callToActionText" TEXT,
    "callToActionUrl" TEXT,
    "callToActionExternal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CityMessage_cityId_key" ON "CityMessage"("cityId");

-- CreateIndex
CREATE INDEX "CityMessage_cityId_isActive_idx" ON "CityMessage"("cityId", "isActive");

-- AddForeignKey
ALTER TABLE "CityMessage" ADD CONSTRAINT "CityMessage_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
