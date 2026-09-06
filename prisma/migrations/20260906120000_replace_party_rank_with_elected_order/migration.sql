-- One ordering field for people. The party rank moves into the council role's
-- elected order for the cities that used it, then the column goes.
--
-- The backfill reproduces the order those cities showed: parties by number of
-- current members, then by party name, then the party rank inside each party.
-- Two parties of equal size are ordered by name because the page they came from
-- had no order of its own there, and a name is the one tie-break a reader can
-- predict. The party id follows the name: two parties may share a name, and
-- without it their members would interleave instead of holding one block each.
--
-- Only current council roles without an elected order are written, and their
-- positions start after the highest elected order the city's council already
-- has, so a value set by hand before this migration keeps its place. A city on
-- the default ordering had no ranks, so nothing changes there.
WITH party_size AS (
    SELECT "partyId", COUNT(DISTINCT "personId") AS members
    FROM "Role"
    WHERE "partyId" IS NOT NULL
      AND ("startDate" IS NULL OR "startDate" <= now())
      AND ("endDate" IS NULL OR "endDate" > now())
    GROUP BY "partyId"
),
ranked AS (
    SELECT DISTINCT ON (council.id)
           council.id AS role_id,
           person."cityId",
           party_role."partyId",
           party_role.rank,
           person.name,
           party.name AS party_name,
           party_size.members
    FROM "Role" council
    JOIN "AdministrativeBody" body
      ON body.id = council."administrativeBodyId" AND body.type = 'council'
    JOIN "Person" person ON person.id = council."personId"
    JOIN "City" city ON city.id = person."cityId" AND city."peopleOrdering" = 'partyRank'
    JOIN "Role" party_role
      ON party_role."personId" = person.id
     AND party_role."partyId" IS NOT NULL
     AND party_role.rank IS NOT NULL
     AND (party_role."startDate" IS NULL OR party_role."startDate" <= now())
     AND (party_role."endDate" IS NULL OR party_role."endDate" > now())
    JOIN "Party" party ON party.id = party_role."partyId"
    JOIN party_size ON party_size."partyId" = party_role."partyId"
    WHERE council."electedOrder" IS NULL
      AND (council."startDate" IS NULL OR council."startDate" <= now())
      AND (council."endDate" IS NULL OR council."endDate" > now())
    ORDER BY council.id, party_role.rank
),
city_max AS (
    SELECT person."cityId", COALESCE(MAX(council."electedOrder"), 0) AS current_max
    FROM "Role" council
    JOIN "AdministrativeBody" body
      ON body.id = council."administrativeBodyId" AND body.type = 'council'
    JOIN "Person" person ON person.id = council."personId"
    GROUP BY person."cityId"
),
numbered AS (
    SELECT ranked.role_id,
           ROW_NUMBER() OVER (
               PARTITION BY ranked."cityId"
               ORDER BY ranked.members DESC, ranked.party_name, ranked."partyId", ranked.rank, ranked.name
           ) + city_max.current_max AS position
    FROM ranked
    JOIN city_max ON city_max."cityId" = ranked."cityId"
)
UPDATE "Role"
SET "electedOrder" = numbered.position
FROM numbered
WHERE "Role".id = numbered.role_id;

-- DropColumn
ALTER TABLE "Role" DROP COLUMN "rank";
