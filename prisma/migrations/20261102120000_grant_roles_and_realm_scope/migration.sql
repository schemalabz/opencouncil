-- Grants with a role and a realm scope (#875). Every existing row is an
-- accepted admin grant at its scope: nobody gains or loses a right here.

CREATE TYPE "GrantRole" AS ENUM ('admin', 'records', 'meetings', 'highlights', 'viewer');

ALTER TABLE "Administers"
    ADD COLUMN "role" "GrantRole" NOT NULL DEFAULT 'admin',
    ADD COLUMN "realm" "Realm",
    ADD COLUMN "grantedById" TEXT,
    ADD COLUMN "acceptedAt" TIMESTAMP(3),
    ADD COLUMN "revokedAt" TIMESTAMP(3),
    ADD COLUMN "revokedById" TEXT;

ALTER TABLE "Administers" ADD CONSTRAINT "Administers_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Administers" ADD CONSTRAINT "Administers_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every grant that exists is in use. A null acceptedAt means a pending invite
-- from now on, and the resolver ignores such a row.
UPDATE "Administers" SET "acceptedAt" = "createdAt" WHERE "acceptedAt" IS NULL;

-- Exactly one scope per row, the realm included.
ALTER TABLE "Administers" DROP CONSTRAINT "Administers_one_scope_check";
ALTER TABLE "Administers" ADD CONSTRAINT "Administers_one_scope_check"
    CHECK (num_nonnulls("realm", "cityId", "partyId", "personId", "administrativeBodyId") = 1);

-- The old unique key spans five nullable columns, and Postgres treats NULLs as
-- distinct, so it never rejected a duplicate. The partial keys below do.
-- Remove the duplicates first: the oldest row of each (user, scope) survives
-- and takes the claim of the group, when one row holds it.
DO $$
DECLARE
    removed integer;
BEGIN
    CREATE TEMP TABLE administers_duplicates ON COMMIT DROP AS
    SELECT id,
           row_number() OVER (PARTITION BY "userId", "cityId", "partyId", "personId", "administrativeBodyId"
                              ORDER BY "createdAt", id) AS rn,
           max("claimedAt") OVER (PARTITION BY "userId", "cityId", "partyId", "personId", "administrativeBodyId") AS group_claimed_at
    FROM "Administers";

    DELETE FROM "Administers" a USING administers_duplicates d WHERE a.id = d.id AND d.rn > 1;
    GET DIAGNOSTICS removed = ROW_COUNT;

    UPDATE "Administers" a SET "claimedAt" = d.group_claimed_at
    FROM administers_duplicates d
    WHERE a.id = d.id AND d.rn = 1 AND a."claimedAt" IS NULL AND d.group_claimed_at IS NOT NULL;

    RAISE NOTICE 'Administers: removed % duplicate rows', removed;
END $$;

DROP INDEX "Administers_userId_cityId_partyId_personId_administrativeBo_key";
DROP INDEX "Administers_user_body_key";

-- One active row per user, role and scope. A user may hold `records` and
-- `meetings` on one body, so the role is part of the key. A revoked row stays
-- as a trace and does not block a new grant.
CREATE UNIQUE INDEX "Administers_active_realm_key" ON "Administers"("userId", "role", "realm") WHERE "realm" IS NOT NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "Administers_active_city_key" ON "Administers"("userId", "role", "cityId") WHERE "cityId" IS NOT NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "Administers_active_party_key" ON "Administers"("userId", "role", "partyId") WHERE "partyId" IS NOT NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "Administers_active_person_key" ON "Administers"("userId", "role", "personId") WHERE "personId" IS NOT NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "Administers_active_body_key" ON "Administers"("userId", "role", "administrativeBodyId") WHERE "administrativeBodyId" IS NOT NULL AND "revokedAt" IS NULL;

-- A revoked claim releases the person: the next claim of the page may land.
DROP INDEX "Administers_claimed_person_key";
CREATE UNIQUE INDEX "Administers_claimed_person_key" ON "Administers"("personId") WHERE "claimedAt" IS NOT NULL AND "revokedAt" IS NULL;

-- The resolver reads the active rows of one user on every request.
CREATE INDEX "Administers_userId_revokedAt_idx" ON "Administers"("userId", "revokedAt");
