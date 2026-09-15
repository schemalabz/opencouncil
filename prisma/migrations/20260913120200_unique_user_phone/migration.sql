-- One account per mobile number. Every write path already refuses a number
-- that another account holds (profile, signup, petition); the index makes the
-- rule a fact of the database, and Notis — one conversation per number — can
-- rely on it.
--
-- Legacy spellings first, so one number cannot hide in two: a Greek mobile
-- without its country code (`6912345678`, `+6912345678`) becomes `+30…`, and
-- bare digits (`306912345678`) get their plus. Anything else is left as it
-- is. Both rules are idempotent: their results match neither pattern.
UPDATE "User" SET phone = '+30' || regexp_replace(phone, '^\+', '')
WHERE phone ~ '^\+?69[0-9]{8}$';
UPDATE "User" SET phone = '+' || phone
WHERE phone ~ '^[0-9]{8,15}$';

-- Production was merged by hand on 2026-09-13 (35 pairs), so the clean-up
-- below finds nothing there beyond what the spellings above may join. In any
-- other database it keeps, per number, the account that signed in last (else
-- the newest) and clears the number on the others, so the index can be
-- created. Idempotent: the integration suite replays this file twice.
WITH ranked AS (
  SELECT u.id,
         row_number() OVER (
           PARTITION BY u.phone
           ORDER BY (SELECT max(s.expires) FROM "Session" s WHERE s."userId" = u.id) DESC NULLS LAST,
                    u."createdAt" DESC,
                    u.id
         ) AS rn
  FROM "User" u
  WHERE u.phone IS NOT NULL
)
UPDATE "User" SET phone = NULL WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- The plain index is redundant under a unique one on the same column.
DROP INDEX IF EXISTS "User_phone_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");
