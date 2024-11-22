-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'pilot',
    "recipientName" TEXT NOT NULL,
    "platformPrice" DOUBLE PRECISION NOT NULL,
    "ingestionPerHourPrice" DOUBLE PRECISION NOT NULL,
    "hoursToIngest" INTEGER NOT NULL,
    "discountPercentage" DOUBLE PRECISION NOT NULL,
    "cityId" TEXT,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);
