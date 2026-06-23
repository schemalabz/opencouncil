-- AlterTable
-- Existing rows default to the Greek realm (the platform's original taxonomy).
ALTER TABLE "Topic" ADD COLUMN     "realm" "Realm" NOT NULL DEFAULT 'greece';

-- CreateIndex
CREATE INDEX "Topic_realm_idx" ON "Topic"("realm");
