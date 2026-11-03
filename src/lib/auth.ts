import "server-only";
import type { City, Realm } from "@prisma/client";
import { cache } from "react";
import { auth } from "@/auth";
import prisma from "@/lib/db/prisma";
import { notAuthorizedError } from "@/lib/api/errors";
import { type UnreleasedScope, NO_UNRELEASED } from "@/lib/unreleased";
import { publicAdministrativeBodyRelation } from "@/lib/db/types";
import { RIGHTS, actorOf, adminRealms, resolve, scopeInCity, type Right } from "@/lib/auth/rights";
import { activeGrantWhere, hasRightOn, realmFor, toTarget, validateScope, type AuthorizationScope } from "@/lib/auth/grants.server";

export { personIsOwnedByBodyAdmin } from "@/lib/auth/rights";
export type { AuthorizationScope } from "@/lib/auth/grants.server";

/**
 * The session's answer to the rights model (#875): who the viewer is, and
 * which rights they hold (src/lib/auth/rights.ts). A caller with an explicit
 * identity and no session (the MCP server) uses src/lib/auth/grants.server.ts.
 */

// Request-scoped so the many call sites that each need the viewer — a page and
// the queries it calls — resolve the session and the user row once per request.
// The grants are the active rows only: a pending or a revoked grant is no right.
const currentUser = cache(async () => {
    const session = await auth();
    if (!session?.user?.email) return null;

    return prisma.user.findUnique({
        where: { email: session.user.email },
        include: {
            administers: {
                where: activeGrantWhere,
                include: {
                    city: true,
                    party: true,
                    person: true,
                    administrativeBody: publicAdministrativeBodyRelation,
                }
            }
        }
    });
});

export async function getCurrentUser() {
    return currentUser();
}

/** Whether the viewer holds the right on the scope; false with no session. */
export async function hasRight(right: Right, scope: AuthorizationScope): Promise<boolean> {
    validateScope(scope);
    const user = await getCurrentUser();
    if (!user) return false;
    return hasRightOn(actorOf(user), right, scope);
}

/** Like hasRight, and throws when the viewer does not hold the right. */
export async function withRight(right: Right, scope: AuthorizationScope): Promise<true> {
    if (!(await hasRight(right, scope))) {
        // An ApiError, so a route that answers through handleApiError says 401
        // without a session and 403 without the right. getCurrentUser is
        // cached per request, so this reads no row again.
        throw notAuthorizedError(Boolean(await getCurrentUser()));
    }
    return true;
}

/**
 * Every right the viewer holds on the scope, for a client component that
 * shows or hides its controls by right. The server checks again on each
 * write, so the list is a view and not a gate.
 */
export async function rightsFor(scope: AuthorizationScope): Promise<Right[]> {
    validateScope(scope);
    const user = await getCurrentUser();
    if (!user) return [];
    if (user.isSuperAdmin) return [...RIGHTS];
    const actor = actorOf(user);
    const target = await toTarget(scope, actor);
    return target ? RIGHTS.filter((right) => resolve(actor, right, target)) : [];
}

/** The `admin` right on the scope: what "may edit" meant before the roles. */
export async function isUserAuthorizedToEdit(scope: AuthorizationScope): Promise<boolean> {
    return hasRight('admin', scope);
}

export async function withUserAuthorizedToEdit(scope: AuthorizationScope): Promise<true> {
    return withRight('admin', scope);
}

/**
 * The realms the /admin tree shows the viewer: null for a superadmin, who
 * sees every realm with no filter; the realms of their `admin` grants
 * otherwise. Throws for a viewer who holds none: every page and route of
 * the tree calls this first and passes the list to its queries.
 */
export async function getAdminRealms(): Promise<Realm[] | null> {
    const user = await getCurrentUser();
    if (user?.isSuperAdmin) return null;
    const realms = user ? adminRealms(actorOf(user)) : [];
    if (realms.length === 0) throw notAuthorizedError(Boolean(user));
    return realms;
}

/**
 * How far the viewer's right reaches inside one city: every meeting and
 * body of the city, or the bodies they hold directly, which is none for a
 * reader.
 */
export async function heldScope(right: Right, cityId: City["id"]): Promise<UnreleasedScope> {
    const user = await getCurrentUser();
    if (!user) return NO_UNRELEASED;
    const actor = actorOf(user);
    return scopeInCity(actor, right, cityId, await realmFor(actor, cityId));
}

/** Which unreleased meetings of a city the viewer may see (see src/lib/unreleased.ts). */
export async function getUnreleasedScope(cityId: City["id"]): Promise<UnreleasedScope> {
    return heldScope('drafts.read', cityId);
}

/**
 * The bodies of a city whose members the viewer may manage. `null` means no
 * limit: a superadmin or a city admin may give a person any role. A set
 * limits the roles of a person payload to those bodies (see
 * validateRolesForBodyAdmin). An empty set means the viewer manages nobody.
 */
export async function getRoleLimitForCity(cityId: City["id"]): Promise<ReadonlySet<string> | null> {
    const scope = await heldScope('admin', cityId);
    return scope.all ? null : new Set(scope.bodyIds);
}
