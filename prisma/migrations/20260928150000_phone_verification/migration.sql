-- Phone verification (issue #813). A reader can prove that they own their
-- mobile number with a code. Verification is optional: the number is saved
-- and Notis writes to it as before. A proved number cannot be claimed by
-- another account, and it takes the place of an unproved claim.
--
-- 1. User.phoneVerifiedAt: when the code matched. Null on every number
--    until its reader proves it.
-- 2. PhoneVerification: the number a reader is proving, with the hashed
--    code we sent. One row per reader.
-- 3. PhoneCodeSend: one row per code that went out. The send limits count
--    these, per account and per number.
--
-- Every statement is idempotent: the integration suite replays this file.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "PhoneVerification" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "phone"           TEXT NOT NULL,
  "codeHash"        TEXT,
  "expiresAt"       TIMESTAMP(3),
  "attempts"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PhoneVerification_userId_key" ON "PhoneVerification"("userId");
CREATE INDEX IF NOT EXISTS "PhoneVerification_phone_idx" ON "PhoneVerification"("phone");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PhoneVerification_userId_fkey'
  ) THEN
    ALTER TABLE "PhoneVerification"
      ADD CONSTRAINT "PhoneVerification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "PhoneCodeSend" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "phone"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneCodeSend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PhoneCodeSend_userId_createdAt_idx" ON "PhoneCodeSend"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PhoneCodeSend_phone_createdAt_idx" ON "PhoneCodeSend"("phone", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PhoneCodeSend_userId_fkey'
  ) THEN
    ALTER TABLE "PhoneCodeSend"
      ADD CONSTRAINT "PhoneCodeSend_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
