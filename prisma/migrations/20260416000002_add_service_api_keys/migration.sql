-- CreateTable
CREATE TABLE "ServiceApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ServiceApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceApiKey_hashedKey_key" ON "ServiceApiKey"("hashedKey");

-- CreateIndex
CREATE INDEX "ServiceApiKey_hashedKey_idx" ON "ServiceApiKey"("hashedKey");

-- AddForeignKey
ALTER TABLE "ServiceApiKey" ADD CONSTRAINT "ServiceApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
