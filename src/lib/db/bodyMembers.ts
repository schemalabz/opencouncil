// The roster tools of an administrative body (#829): end a membership,
// start a new term, import a pasted list, and hand out the claim links of
// the members. Every write is gated on the body, so an admin of the body
// runs them (#828), and so does an admin of the city.
import "server-only";
import type { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { NotFoundError } from "@/lib/api/errors";
import { claimExpiry, claimLastValidDay, personJoinUrl } from "@/lib/auth/personClaim";
import { getClaimedPersonIds } from "./personClaim";
import { getActiveRoleCondition } from "@/lib/utils/roles";
import { sortBodyMembers } from "@/lib/sorting/people";
import type { RosterEntry } from "@/lib/zod-schemas/bodyMembers";

/**
 * The body and its city, for a caller that is an admin of the body or of
 * the city. The roster parser reads the names and the language from it.
 */
export async function getBodyForRoster(cityId: string, bodyId: string) {
    return requireBody(cityId, bodyId);
}

async function requireBody(cityId: string, bodyId: string) {
    await withUserAuthorizedToEdit({ cityId, administrativeBodyId: bodyId });
    const body = await prisma.administrativeBody.findFirst({
        where: { id: bodyId, cityId },
        select: { id: true, name: true, name_en: true, city: { select: { id: true, name: true, realm: true, timezone: true, language: true } } },
    });
    if (!body) throw new NotFoundError("Administrative body not found");
    return body;
}

/** The roles on the body that are active at `at`. */
function activeOnBody(bodyId: string, at: Date): Prisma.RoleWhereInput {
    return { administrativeBodyId: bodyId, OR: getActiveRoleCondition(at) };
}

/**
 * End the membership of one person: their active roles on the body get the
 * end date. The roles stay, so the person shows among the former members.
 */
export async function endBodyMembership(cityId: string, bodyId: string, personId: string, endDate: Date = new Date()): Promise<{ ended: number }> {
    await requireBody(cityId, bodyId);
    const { count } = await prisma.role.updateMany({
        where: { personId, person: { cityId }, ...activeOnBody(bodyId, endDate) },
        data: { endDate },
    });
    if (count === 0) throw new NotFoundError("This person holds no active role on the body");
    return { ended: count };
}

/**
 * Start a new term: every active role on the body ends at `endDate`. The
 * admin then imports or adds the new members. Nothing is deleted.
 */
export async function startNewTerm(cityId: string, bodyId: string, endDate: Date = new Date()): Promise<{ ended: number }> {
    await requireBody(cityId, bodyId);
    const { count } = await prisma.role.updateMany({ where: activeOnBody(bodyId, endDate), data: { endDate } });
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

/**
 * Import a confirmed list. A person who exists in the city, by name, gets
 * the role instead of a second row; one who holds an active role on the
 * body already is left alone. The name is matched among the people who have
 * held a role on this body and the people with no role at all: a namesake
 * on the municipality's roster is another person, and gets a row of their
 * own. The whole list goes in one transaction.
 */
export async function importBodyMembers(
    cityId: string,
    bodyId: string,
    entries: RosterEntry[],
    { startDate = null }: { startDate?: Date | null } = {},
): Promise<RosterImportResult> {
    await requireBody(cityId, bodyId);
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
export async function getBodyClaimLinks(cityId: string, bodyId: string): Promise<BodyClaimLinks> {
    const body = await requireBody(cityId, bodyId);
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
