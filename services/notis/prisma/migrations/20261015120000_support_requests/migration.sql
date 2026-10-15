-- Support requests. The agent files one when a reader is unhappy with Notis
-- or OpenCouncil, asks for a person, needs help with OpenCouncil itself, or
-- reports wrong data. The OpenCouncil team contacts the reader later, and
-- closes the request in the panel.
--
-- Replay-safe throughout: the integration harness applies migrations twice.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportRequestKind') THEN
    CREATE TYPE "SupportRequestKind" AS ENUM ('dissatisfaction', 'contact', 'help', 'data_error');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportRequestStatus') THEN
    CREATE TYPE "SupportRequestStatus" AS ENUM ('open', 'withdrawn', 'closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "NotisSupportRequest" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "wakeId"         TEXT,
  "kind"           "SupportRequestKind" NOT NULL,
  "status"         "SupportRequestStatus" NOT NULL DEFAULT 'open',
  "summary"        TEXT NOT NULL,
  "readerWords"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "withdrawnAt"    TIMESTAMP(3),
  "closedAt"       TIMESTAMP(3),
  CONSTRAINT "NotisSupportRequest_pkey" PRIMARY KEY ("id")
);

-- The open-request read on every wake.
CREATE INDEX IF NOT EXISTS "NotisSupportRequest_subscriptionId_status_idx"
  ON "NotisSupportRequest" ("subscriptionId", "status");

-- The panel's list: open first, newest first.
CREATE INDEX IF NOT EXISTS "NotisSupportRequest_status_createdAt_idx"
  ON "NotisSupportRequest" ("status", "createdAt");

-- One open request per reader. The wake persist reads the open row and
-- updates it under the subscription's row lock, so this index is the
-- backstop, not the mechanism. Prisma cannot express a partial index.
CREATE UNIQUE INDEX IF NOT EXISTS "NotisSupportRequest_one_open_per_sub"
  ON "NotisSupportRequest" ("subscriptionId")
  WHERE "status" = 'open';

-- Cascade: the janitor's orphan purge deletes subscriptions with a bare
-- deleteMany and would fail on a restricting foreign key.
DO $$
BEGIN
  ALTER TABLE "NotisSupportRequest"
    ADD CONSTRAINT "NotisSupportRequest_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "NotisSubscription"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The request outlives the wake that opened it.
DO $$
BEGIN
  ALTER TABLE "NotisSupportRequest"
    ADD CONSTRAINT "NotisSupportRequest_wakeId_fkey"
    FOREIGN KEY ("wakeId") REFERENCES "NotisWake"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
