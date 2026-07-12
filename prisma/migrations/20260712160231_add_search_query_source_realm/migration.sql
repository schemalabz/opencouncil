-- AlterTable
ALTER TABLE "SearchQuery" ADD COLUMN     "realm" "Realm" NOT NULL DEFAULT 'greece',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'search';

-- CreateIndex
CREATE INDEX "SearchQuery_realm_createdAt_idx" ON "SearchQuery"("realm", "createdAt");
