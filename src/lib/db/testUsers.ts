import type { Prisma, PrismaClient } from '@prisma/client';
// No `server-only`: `npm run seed` imports this module through tsx, outside Next.js.
import { TEST_USER_EMAILS, TEST_USERS, type TestUserAdminType } from '@/lib/dev/test-users';

type TestUser = (typeof TEST_USERS)[number];

/** A fresh database gets these ids. A database seeded before keeps the ids its rows already have. */
export function testUserId(adminType: TestUserAdminType): string {
    return `seed-user-${adminType}`;
}

/** Athens, for a city without geometry. */
const FALLBACK_CENTROID = { lng: 23.7275, lat: 37.9838 };

const administersSelect = {
    cityId: true,
    partyId: true,
    personId: true,
    administrativeBodyId: true,
    city: { select: { name: true } },
    party: { select: { name: true, cityId: true } },
    person: { select: { name: true, cityId: true } },
    administrativeBody: { select: { name: true, cityId: true } },
} satisfies Prisma.AdministersSelect;

const testUserSelect = {
    id: true,
    email: true,
    name: true,
    isSuperAdmin: true,
    phone: true,
    administers: { select: administersSelect, orderBy: [{ cityId: 'asc' }, { partyId: 'asc' }, { personId: 'asc' }, { administrativeBodyId: 'asc' }] },
    notificationPreferences: { select: { cityId: true }, orderBy: { cityId: 'asc' } },
} satisfies Prisma.UserSelect;

export type TestUserState = Prisma.UserGetPayload<{ select: typeof testUserSelect }> & { adminType: TestUserAdminType };

type Grant = { cityId: string } | { partyId: string } | { personId: string; claimedAt: Date } | { administrativeBodyId: string };

type ScopedEntities = { cityIds: string[]; partyIds: string[]; personIds: string[]; bodyIds: string[] };

/**
 * The party with the most roles, the person with the most speaker segments, and
 * the body with the most meetings in each city, so the party, person, and body
 * admin pages have content. The body is one other than the council when the city
 * has one: the city admin's rights already cover the council. The person is one
 * that no other account has claimed: the person admin claims it, and a person has
 * at most one claim (`Administers_claimed_person_key`). On staging, councillors
 * claim their own pages. A city with no party, no speaking person that is free to
 * claim, or no body gives no entry.
 */
async function busiestEntities(db: PrismaClient, cityIds: string[]): Promise<ScopedEntities> {
    const parties = await db.party.findMany({
        where: { cityId: { in: cityIds } },
        select: { id: true, cityId: true },
        orderBy: [{ roles: { _count: 'desc' } }, { id: 'asc' }],
    });
    // Prisma cannot order by a count two relations away (Person -> SpeakerTag -> SpeakerSegment).
    const persons = await db.$queryRaw<Array<{ id: string; cityId: string }>>`
        SELECT p.id, p."cityId"
        FROM "Person" p
        JOIN "SpeakerTag" t ON t."personId" = p.id
        JOIN "SpeakerSegment" s ON s."speakerTagId" = t.id
        WHERE p."cityId" = ANY(${cityIds})
          AND NOT EXISTS (
              SELECT 1 FROM "Administers" a JOIN "User" u ON u.id = a."userId"
              WHERE a."personId" = p.id AND a."claimedAt" IS NOT NULL AND u.email <> ${TEST_USER_EMAILS.PERSON_ADMIN})
        GROUP BY p.id, p."cityId"
        ORDER BY count(*) DESC, p.id`;
    const bodies = await db.administrativeBody.findMany({
        where: { cityId: { in: cityIds } },
        select: { id: true, cityId: true, type: true },
        orderBy: [{ meetings: { _count: 'desc' } }, { id: 'asc' }],
    });
    const firstPerCity = (rows: Array<{ id: string; cityId: string }>) => {
        const seen = new Map<string, string>();
        for (const row of rows) if (!seen.has(row.cityId)) seen.set(row.cityId, row.id);
        return cityIds.flatMap((cityId) => seen.get(cityId) ?? []);
    };
    const councilsLast = [...bodies.filter((b) => b.type !== 'council'), ...bodies.filter((b) => b.type === 'council')];
    return { cityIds, partyIds: firstPerCity(parties), personIds: firstPerCity(persons), bodyIds: firstPerCity(councilsLast) };
}

function grantsFor(adminType: TestUserAdminType, scope: ScopedEntities): Grant[] {
    switch (adminType) {
        case 'city':
            return scope.cityIds.map((cityId) => ({ cityId }));
        case 'party':
            return scope.partyIds.map((partyId) => ({ partyId }));
        case 'person':
            // Claimed, as a QR scan would: the test person admin is the person.
            return scope.personIds.map((personId) => ({ personId, claimedAt: new Date() }));
        case 'body':
            return scope.bodyIds.map((administrativeBodyId) => ({ administrativeBodyId }));
        case 'superadmin':
        case 'readonly':
            return [];
    }
}

/**
 * Administers has a unique key over nullable columns, and Postgres treats NULLs as
 * distinct, so an upsert cannot find the existing row. Look it up first.
 */
async function ensureGrant(db: PrismaClient, userId: string, grant: Grant) {
    const where = {
        userId,
        cityId: 'cityId' in grant ? grant.cityId : null,
        partyId: 'partyId' in grant ? grant.partyId : null,
        personId: 'personId' in grant ? grant.personId : null,
        administrativeBodyId: 'administrativeBodyId' in grant ? grant.administrativeBodyId : null,
    };
    const existing = await db.administers.findFirst({ where, select: { id: true } });
    if (!existing) await db.administers.create({ data: { ...where, claimedAt: 'claimedAt' in grant ? grant.claimedAt : null } });
}

/**
 * A pinned location near the city's centroid. Production creates locations only
 * inside the transactions that reference them (src/lib/db/location.ts); a dev
 * fixture is not a reason to put a location write on that surface. The fixed id
 * and ON CONFLICT make a re-run a no-op.
 */
async function ensureLocation(db: PrismaClient, id: string, text: string, cityId: string, offset: number) {
    await db.$executeRaw`
        INSERT INTO "Location" (id, type, text, coordinates)
        SELECT ${id}, 'point'::"LocationType", ${text},
               ST_SetSRID(ST_MakePoint(
                   COALESCE(ST_X(ST_Centroid(c.geometry)), ${FALLBACK_CENTROID.lng}) + ${offset},
                   COALESCE(ST_Y(ST_Centroid(c.geometry)), ${FALLBACK_CENTROID.lat}) + ${offset}), 4326)
        FROM "City" c WHERE c.id = ${cityId}
        ON CONFLICT (id) DO NOTHING`;
    return id;
}

async function ensurePreference(db: PrismaClient, userId: string, cityId: string, topicIds: string[], locationIds: string[]) {
    const data = {
        interests: { connect: topicIds.map((id) => ({ id })) },
        locations: { connect: locationIds.map((id) => ({ id })) },
    };
    await db.notificationPreference.upsert({
        where: { userId_cityId: { userId, cityId } },
        update: data,
        create: { userId, cityId, notifyByEmail: true, ...data },
    });
}

/**
 * Every test user gets its fake phone with the WhatsApp channel on and a
 * notification preference, so the Notis poller enrolls it. Superadmin and
 * readonly carry pinned locations, so the location path has data. The superadmin
 * also follows a second city, so the multi-city path has data.
 */
async function ensureNotisFixtures(db: PrismaClient, userId: string, testUser: TestUser, cityIds: string[], topicIds: string[]) {
    await db.user.update({ where: { id: userId }, data: { phone: testUser.phone, notifyByPhone: true } });
    const [first, second] = cityIds;
    if (!first) return;
    const withLocations = testUser.adminType === 'superadmin' || testUser.adminType === 'readonly';
    const locationIds = withLocations
        ? [await ensureLocation(db, 'ntest-loc-1', 'Κεντρική Πλατεία', first, 0.003), await ensureLocation(db, 'ntest-loc-2', 'Δημοτικό Στάδιο', first, -0.004)]
        : [];
    await ensurePreference(db, userId, first, topicIds, locationIds);
    if (testUser.adminType === 'superadmin' && second) {
        await ensurePreference(db, userId, second, topicIds, [await ensureLocation(db, 'ntest-loc-3', 'Δημαρχείο', second, 0.002)]);
    }
}

/**
 * Brings the test accounts of `TEST_USERS` to their full state: the user row, the
 * admin rights, the phone, and the notification preferences. It only adds what is
 * missing, so a call after a restore, a refresh, or a cascade puts back what was
 * removed, and a right that someone added by hand stays.
 *
 * The city admin administers every supported city. The party, person, and body
 * admins administer the busiest party, person (one that no other account has
 * claimed), and body of each supported city (see busiestEntities), so each of their rights stays scoped inside one city for
 * negative tests.
 *
 * Takes the client as an argument: the seed CLI connects to an explicit local URL
 * and must not load the app's environment, which can name a remote database.
 */
export async function ensureTestUsers(db: PrismaClient): Promise<TestUserState[]> {
    const cities = await db.city.findMany({ where: { status: 'supported' }, select: { id: true }, orderBy: { id: 'asc' } });
    const cityIds = cities.map((c) => c.id);
    const scope = await busiestEntities(db, cityIds);
    const topicIds = (await db.topic.findMany({ take: 2, select: { id: true }, orderBy: { id: 'asc' } })).map((t) => t.id);

    for (const testUser of TEST_USERS) {
        const { id: userId } = await db.user.upsert({
            where: { email: testUser.email },
            update: { isSuperAdmin: testUser.isSuperAdmin, onboarded: true },
            create: { id: testUserId(testUser.adminType), email: testUser.email, name: testUser.name, isSuperAdmin: testUser.isSuperAdmin, onboarded: true },
            select: { id: true },
        });
        for (const grant of grantsFor(testUser.adminType, scope)) await ensureGrant(db, userId, grant);
        await ensureNotisFixtures(db, userId, testUser, cityIds, topicIds);
    }
    return listTestUsers(db);
}

/** The test accounts that exist, with what each administers. */
export async function listTestUsers(db: PrismaClient): Promise<TestUserState[]> {
    const users = await db.user.findMany({ where: { email: { in: TEST_USERS.map((u) => u.email) } }, select: testUserSelect });
    return TEST_USERS.flatMap((testUser) => {
        const user = users.find((u) => u.email === testUser.email);
        return user ? [{ ...user, adminType: testUser.adminType }] : [];
    });
}
