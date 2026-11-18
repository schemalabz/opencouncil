// The roster tools of an administrative body (#829): end a membership,
// start a new term, import a pasted list, and hand out the claim links of
// the members. Each tool takes the body that requireBody returns, so an
// admin of the body runs them (#828), and so does an admin of the city.
import "server-only";
import type { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { BadRequestError, ConflictError, NotFoundError } from "@/lib/api/errors";
import { claimExpiry, claimLastValidDay, personJoinUrl } from "@/lib/auth/personClaim";
import { getClaimedPersonIds } from "./personClaim";
import { getActiveRoleCondition } from "@/lib/utils/roles";
import { mayStartNewTerm } from "@/lib/utils/administrativeBodies";
import { sortBodyMembers } from "@/lib/sorting/people";
import type { RosterEntry } from "@/lib/zod-schemas/bodyMembers";
import { roleDatesInOrder } from "@/lib/zod-schemas/role";
import { vmsg } from "@/lib/zod-schemas/messages";
import { dayBoundsAt } from "@/lib/dates/dayBounds";

/**
 * The gate of the roster tools: the body and its city, for an admin of the
 * body or of the city. A route calls it before it reads the request, so a
 * caller without rights learns nothing about the schema. The roster parser
 * reads the names and the language from it.
 */
export async function requireBody(cityId: string, bodyId: string) {
    await withUserAuthorizedToEdit({ cityId, administrativeBodyId: bodyId });
    const body = await prisma.administrativeBody.findFirst({
        where: { id: bodyId, cityId },
        select: { id: true, name: true, name_en: true, type: true, city: { select: { id: true, name: true, realm: true, timezone: true, language: true } } },
    });
    if (!body) throw new NotFoundError("Administrative body not found");
    return body;
}

export type RosterBody = Awaited<ReturnType<typeof requireBody>>;

/** The roles on the body that are active at `at`. */
function activeOnBody(bodyId: string, at: Date): Prisma.RoleWhereInput {
    return { administrativeBodyId: bodyId, OR: getActiveRoleCondition(at) };
}

/**
 * The admin records an end that happened, today or on a past day. An end
 * after today, in the city's zone, is refused: the member would stay active
 * until that day, and an import before it would count them as a member.
 */
function refuseFutureEnd(body: RosterBody, endDate: Date): void {
    if (endDate > dayBoundsAt(new Date(), body.city.timezone).end) throw new BadRequestError(vmsg('roleEndInFuture'));
}

/**
 * End the membership of one person: their active roles on the body get the
 * end date. The roles stay, so the person shows among the former members.
 * The admin can give a past date: a role must not end before it starts.
 */
export async function endBodyMembership(body: RosterBody, personId: string, endDate: Date = new Date()): Promise<{ ended: number }> {
    refuseFutureEnd(body, endDate);
    const current = await prisma.role.findMany({
        where: { personId, person: { cityId: body.city.id }, ...activeOnBody(body.id, new Date()) },
        select: { id: true, startDate: true },
    });
    if (current.length === 0) throw new NotFoundError("This person holds no active role on the body");
    if (!current.every(role => roleDatesInOrder({ startDate: role.startDate, endDate }))) {
        throw new BadRequestError(vmsg('roleEndBeforeStart'));
    }
    const { count } = await prisma.role.updateMany({ where: { id: { in: current.map(role => role.id) } }, data: { endDate } });
    return { ended: count };
}

/**
 * Start a new term: every active role on the body that started before the
 * day of `endDate` ends at `endDate`. The admin then imports or adds the new
 * members. Nothing is deleted. A role that starts on that day or later
 * stays: it is a member of the new term, whom the admin added first. The day
 * is the city's, and not the moment of the end: the default end is now, and
 * a role that the admin adds for today starts at midnight. A council has no
 * such step (see mayStartNewTerm).
 */
export async function startNewTerm(body: RosterBody, endDate: Date = new Date()): Promise<{ ended: number }> {
    if (!mayStartNewTerm(body)) throw new ConflictError("The seats of a council end after an election, when OpenCouncil loads the new council");
    refuseFutureEnd(body, endDate);
    const endDay = dayBoundsAt(endDate, body.city.timezone).start;
    const { count } = await prisma.role.updateMany({
        where: { ...activeOnBody(body.id, new Date()), AND: [{ OR: [{ startDate: null }, { startDate: { lt: endDay } }] }] },
        data: { endDate },
    });
    return { ended: count };
}

export interface RosterImportResult {
    /** People created with their role. */
    created: number;
    /** People of the city who existed and got the role. */
    joined: number;
    /** People who held an active role on the body already. */
    skipped: number;
}

/** Names compare without case, accents on capitals, or double spaces. */
function nameKey(name: string): string {
    return name.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * When the memberships of an import with an open start begin: where the
 * last membership of the body ended, when one has. A new term ends every
 * role at one date (startNewTerm); the members of the next term then start
 * there, and stay out of the minutes of the old term. A body whose roles
 * never ended keeps the open start, so its first list counts at every past
 * meeting.
 */
async function lastMembershipEnd(tx: Prisma.TransactionClient, bodyId: string, now: Date): Promise<Date | null> {
    const { _max } = await tx.role.aggregate({ where: { administrativeBodyId: bodyId, endDate: { lte: now } }, _max: { endDate: true } });
    return _max.endDate;
}

/** When an import with no start date starts its memberships now. The import dialog shows it as the default. */
export function defaultImportStart(body: RosterBody): Promise<Date | null> {
    return lastMembershipEnd(prisma, body.id, new Date());
}

/**
 * Import a confirmed list. A person who exists in the city, by name, gets
 * the role instead of a second row; one who holds an active role on the
 * body already is left alone. The name is matched among the people who have
 * held a role on this body and the people with no role at all: a namesake
 * on the municipality's roster is another person, and gets a row of their
 * own. The whole list goes in one transaction.
 */
export async function importBodyMembers(
    { id: bodyId, city: { id: cityId } }: RosterBody,
    entries: RosterEntry[],
    { startDate = null }: { startDate?: Date | null } = {},
): Promise<RosterImportResult> {
    const now = new Date();
    return prisma.$transaction(async (tx) => {
        const start = startDate ?? await lastMembershipEnd(tx, bodyId, now);
        const people = await tx.person.findMany({
            where: { cityId, OR: [{ roles: { none: {} } }, { roles: { some: { administrativeBodyId: bodyId } } }] },
            select: { id: true, name: true, roles: { where: activeOnBody(bodyId, now), select: { id: true } } },
        });
        const byName = new Map(people.map(person => [nameKey(person.name), person]));
        const result: RosterImportResult = { created: 0, joined: 0, skipped: 0 };
        for (const entry of entries) {
            const role = {
                administrativeBodyId: bodyId,
                name: entry.roleName,
                name_en: entry.roleName_en,
                isHead: entry.isHead,
                startDate: start,
            };
            const existing = byName.get(nameKey(entry.name));
            if (existing) {
                if (existing.roles.length > 0) {
                    result.skipped++;
                    continue;
                }
                await tx.role.create({ data: { ...role, personId: existing.id } });
                existing.roles.push({ id: 'new' });
                result.joined++;
                continue;
            }
            const person = await tx.person.create({
                data: {
                    cityId,
                    name: entry.name,
                    name_en: entry.name_en,
                    name_short: entry.name_short,
                    name_short_en: entry.name_short_en,
                    roles: { create: [role] },
                },
                select: { id: true, name: true },
            });
            byName.set(nameKey(person.name), { ...person, roles: [{ id: 'new' }] });
            result.created++;
        }
        return result;
    });
}

export interface BodyClaimLink {
    id: string;
    name: string;
    role: string | null;
    joinUrl: string;
}

export interface BodyClaimLinks {
    people: BodyClaimLink[];
    /** The last day the links work, as a date in the city's timezone. */
    validUntil: string;
}

/**
 * A claim link for each active member who has no account yet, minted now
 * and valid for the claim lifetime. The admin hands them out; the member
 * signs in through the link and gets their page (lib/auth/personClaim.ts).
 * A link claims the whole person, so it goes only to a member whose every
 * role is on this body: a member with a seat elsewhere in the municipality
 * (the council, a party, another body) is the city admin's to hand a link
 * to, as in `personIsOwnedByBodyAdmin` (lib/auth.ts).
 */
export async function getBodyClaimLinks(body: RosterBody): Promise<BodyClaimLinks> {
    const { id: bodyId, city: { id: cityId } } = body;
    const now = new Date();
    const [members, claimed] = await Promise.all([
        prisma.person.findMany({
            where: {
                cityId,
                roles: {
                    some: activeOnBody(bodyId, now),
                    none: { OR: [{ administrativeBodyId: null }, { administrativeBodyId: { not: bodyId } }] },
                },
            },
            select: {
                id: true,
                name: true,
                cityId: true,
                // The active roles alone: an ended title must not label a current member.
                roles: { where: activeOnBody(bodyId, now), include: { administrativeBody: { select: { id: true, name: true, type: true } } } },
            },
        }),
        getClaimedPersonIds(cityId),
    ]);
    const expiresAt = claimExpiry();
    return {
        people: sortBodyMembers(members, bodyId)
            .filter(member => !claimed.has(member.id))
            .map(member => ({
                id: member.id,
                name: member.name,
                role: member.roles.find(role => role.name)?.name ?? null,
                joinUrl: personJoinUrl(member, body.city.realm, expiresAt),
            })),
        validUntil: claimLastValidDay(expiresAt).toISOString(),
    };
}
