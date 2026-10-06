import "server-only";
import { type City, type Party, type Person, type CouncilMeeting, type AdministrativeBody } from "@prisma/client";
import { cache } from "react";
import { auth } from "@/auth";
import prisma from "@/lib/db/prisma";
import { validateServiceApiKey } from "@/lib/db/apiKeys";
import { ForbiddenError, UnauthorizedError } from "@/lib/api/errors";
import { type NextRequest } from "next/server";
import { type UnreleasedScope, NO_UNRELEASED, ALL_UNRELEASED } from "@/lib/unreleased";

// Request-scoped so the many call sites that each need the viewer — a page and
// the queries it calls — resolve the session and the user row once per request.
const currentUser = cache(async () => {
    const session = await auth();
    if (!session?.user?.email) return null;

    return prisma.user.findUnique({
        where: { email: session.user.email },
        include: {
            administers: {
                include: {
                    city: true,
                    party: true,
                    person: true,
                    administrativeBody: true,
                }
            }
        }
    });
});

export async function getCurrentUser() {
    return currentUser();
}

/**
 * What a check is about. The shapes that the check accepts:
 *
 * - `{}`: superadmin only.
 * - `{ cityId }`: an admin of the city. A body admin never passes this one,
 *   so a mutation that nobody converts to a narrower shape stays closed to them.
 * - `{ cityId, councilMeetingId }`: an admin of the city, or an admin of the
 *   body that holds the meeting.
 * - `{ cityId, administrativeBodyId }`: an admin of the city, or an admin of
 *   that body.
 * - `{ partyId }`: an admin of the party, or of its city.
 * - `{ personId }`: an admin of the person, of its city, or of the bodies it
 *   sits on (see personIsOwnedByBodyAdmin).
 */
export type AuthorizationScope = {
    cityId?: City["id"],
    partyId?: Party["id"],
    personId?: Person["id"],
    councilMeetingId?: CouncilMeeting["id"],
    administrativeBodyId?: AdministrativeBody["id"],
};

type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/** The bodies of one city that an account administers directly, sorted. */
function heldBodyIdsInCity(user: CurrentUser, cityId: string): string[] {
    return user.administers
        .flatMap(a => a.administrativeBody?.cityId === cityId ? [a.administrativeBody.id] : [])
        .sort();
}

function administersCity(user: CurrentUser, cityId: string): boolean {
    return user.administers.some(a => a.cityId === cityId);
}

function administersBody(user: CurrentUser, bodyId: string): boolean {
    return user.administers.some(a => a.administrativeBodyId === bodyId);
}

// Request-scoped: a meeting page asks about the same meeting many times.
const meetingBody = cache(async (cityId: string, meetingId: string) => {
    return prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { administrativeBodyId: true },
    });
});

const bodyCity = cache(async (bodyId: string) => {
    return prisma.administrativeBody.findUnique({
        where: { id: bodyId },
        select: { cityId: true },
    });
});

const personRoles = cache(async (personId: string) => {
    return prisma.person.findUnique({
        where: { id: personId },
        select: { cityId: true, roles: { select: { administrativeBodyId: true } } },
    });
});

/**
 * A body admin owns a person when the person has at least one role and every
 * role, past or present, is on a body they hold. A person with no role goes
 * on every council roster, and a person with a seat elsewhere (a party, the
 * council, a city-level office) is a superadmin's or city admin's to edit.
 */
export function personIsOwnedByBodyAdmin(
    roles: { administrativeBodyId?: string | null }[],
    heldBodyIds: ReadonlySet<string>,
): boolean {
    return roles.length > 0 && roles.every(role => !!role.administrativeBodyId && heldBodyIds.has(role.administrativeBodyId));
}

async function checkUserAuthorization({
    cityId,
    partyId,
    personId,
    councilMeetingId,
    administrativeBodyId,
}: AuthorizationScope) {
    const definedParams = [partyId, personId].filter(Boolean);
    const hasCityId = Boolean(cityId);
    const hasCouncilMeetingId = Boolean(councilMeetingId);
    const hasBodyId = Boolean(administrativeBodyId);

    // Validate parameter combinations
    if (definedParams.length > 1) {
        throw new Error("Only one of partyId or personId should be defined");
    }

    if (definedParams.length > 0 && (hasCityId || hasCouncilMeetingId || hasBodyId)) {
        throw new Error("cityId/councilMeetingId/administrativeBodyId cannot be combined with partyId or personId");
    }

    if ((hasCouncilMeetingId || hasBodyId) && !hasCityId) {
        throw new Error("cityId is required when councilMeetingId or administrativeBodyId is provided");
    }

    if (hasCouncilMeetingId && hasBodyId) {
        throw new Error("Only one of councilMeetingId or administrativeBodyId should be defined");
    }

    const user = await getCurrentUser();
    if (!user) return false;

    // Superadmins can edit everything
    if (user.isSuperAdmin) return true;

    if (!cityId && !partyId && !personId) {
        return false; // Only superadmins can edit anything
    }

    if (cityId) {
        // A body of another city never passes, for a city admin either: the
        // routes take the city and the body from two URL segments.
        if (administrativeBodyId) {
            const body = await bodyCity(administrativeBodyId);
            if (body?.cityId !== cityId) return false;
        }

        if (administersCity(user, cityId)) return true;

        // A body admin: through the meeting or the body, never through the city alone.
        if (councilMeetingId) {
            // `false`, not a throw: the meeting layout asks this on every render,
            // and an unknown meeting must 404 there, not 500.
            const meeting = await meetingBody(cityId, councilMeetingId);
            return !!meeting?.administrativeBodyId && administersBody(user, meeting.administrativeBodyId);
        }
        if (administrativeBodyId) {
            return administersBody(user, administrativeBodyId);
        }
        return false;
    }

    if (partyId) {
        if (user.administers.some(a => a.partyId === partyId)) return true;
        const party = await prisma.party.findUnique({ where: { id: partyId }, select: { cityId: true } });
        return !!party && administersCity(user, party.cityId);
    }

    if (personId) {
        if (user.administers.some(a => a.personId === personId)) return true;
        const person = await personRoles(personId);
        if (!person) return false;
        if (administersCity(user, person.cityId)) return true;
        const held = new Set(heldBodyIdsInCity(user, person.cityId));
        return held.size > 0 && personIsOwnedByBodyAdmin(person.roles, held);
    }

    return false;
}

export async function withUserAuthorizedToEdit(scope: AuthorizationScope) {
    const isAuthorized = await checkUserAuthorization(scope);

    if (!isAuthorized) {
        // An ApiError, so a route that answers through handleApiError says 403
        // and not 500. The message stays: callers match on it.
        throw new ForbiddenError("Not authorized");
    }

    return true;
}

export async function isUserAuthorizedToEdit(scope: AuthorizationScope) {
    return checkUserAuthorization(scope);
}

/**
 * Which unreleased meetings of a city the viewer may see (see
 * src/lib/unreleased.ts): all of them for a superadmin or a city admin, the
 * meetings of the bodies they administer in the city otherwise, which is none
 * for a reader.
 */
export async function getUnreleasedScope(cityId: City["id"]): Promise<UnreleasedScope> {
    const user = await getCurrentUser();
    if (!user) return NO_UNRELEASED;
    if (user.isSuperAdmin || administersCity(user, cityId)) return ALL_UNRELEASED;
    return { all: false, bodyIds: heldBodyIdsInCity(user, cityId) };
}

/**
 * The bodies of a city whose members the viewer may manage. `null` means no
 * limit: a superadmin or a city admin may give a person any role. A set
 * limits the roles of a person payload to those bodies (see
 * validateRolesForBodyAdmin). An empty set means the viewer manages nobody.
 */
export async function getRoleLimitForCity(cityId: City["id"]): Promise<ReadonlySet<string> | null> {
    const user = await getCurrentUser();
    if (!user) return new Set();
    if (user.isSuperAdmin || administersCity(user, cityId)) return null;
    return new Set(heldBodyIdsInCity(user, cityId));
}

export type ServiceAuthResult =
    | { type: 'service'; keyName: string }
    | { type: 'user'; userId: string };

/**
 * Validate a service API key from the `Authorization: Bearer …` header.
 * Returns `null` if no Bearer header is present (caller may fall back to session auth).
 * Throws `UnauthorizedError` if the Bearer token is invalid or revoked — never falls through.
 */
export async function validateBearerAuth(
    request: NextRequest
): Promise<{ keyName: string } | null> {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    const apiKey = await validateServiceApiKey(token);
    if (!apiKey) throw new UnauthorizedError("Invalid API key");

    return { keyName: apiKey.name };
}

/**
 * Authenticate a request via either a service API key (Bearer token)
 * or a user session. Service keys get full access (equivalent to superadmin).
 * User sessions are checked against the standard authorization hierarchy.
 *
 * Throws if neither auth method succeeds.
 */
export async function withServiceOrUserAuth(
    request: NextRequest,
    scope: AuthorizationScope = {}
): Promise<ServiceAuthResult> {
    const bearer = await validateBearerAuth(request);
    if (bearer) {
        return { type: 'service', keyName: bearer.keyName };
    }

    // Fall back to session auth — reuse the result to avoid a second DB round-trip
    const isAuthorized = await checkUserAuthorization(scope);
    if (!isAuthorized) {
        throw new UnauthorizedError("Not authorized");
    }

    // checkUserAuthorization already verified the user exists and is authorized,
    // so getCurrentUser() is guaranteed to return non-null here. However this is
    // still a second DB call. TODO: refactor checkUserAuthorization to return the user.
    const user = await getCurrentUser();
    return { type: 'user', userId: user!.id };
}
