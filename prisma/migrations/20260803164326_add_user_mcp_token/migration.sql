-- CreateTable
CREATE TABLE "UserMcpToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'MCP token',
    "hashedKey" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserMcpToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMcpToken_hashedKey_key" ON "UserMcpToken"("hashedKey");

-- AddForeignKey
ALTER TABLE "UserMcpToken" ADD CONSTRAINT "UserMcpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
