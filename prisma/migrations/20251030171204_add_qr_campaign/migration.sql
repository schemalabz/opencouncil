-- CreateTable
CREATE TABLE "QrCampaign" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QrCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QrCampaign_code_key" ON "QrCampaign"("code");
