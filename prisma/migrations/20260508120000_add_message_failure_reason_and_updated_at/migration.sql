-- Add Bird's failure description (populated when status transitions to `failed`)
-- and an `updatedAt` column so we can see when each row last changed (initial
-- send, polled status, webhook update).

ALTER TABLE "Message" ADD COLUMN "failureReason" TEXT;

-- Backfill existing rows to `now()` so the NOT NULL column has a value, then
-- let Prisma's @updatedAt take over for future writes.
ALTER TABLE "Message" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
