// Who may set the photo of a person (#829). A person whose every role is on
// a secondary body, a youth council member among them, adds their photo from
// their own account only: the account that claimed their page. Nobody adds
// the photo of such a person who has no page yet. Anyone who may edit a
// person with a seat on the municipality's own roster sets their photo, as
// before. The privacy page promises this.
import "server-only";
import type { AdministrativeBodyType } from '@prisma/client';
import prisma from './prisma';
import { getCurrentUser } from '@/lib/auth';
import { ForbiddenError } from '@/lib/api/errors';
import { hasPrimaryPresence } from '@/lib/utils/bodyTier';

export type RoleOfPerson = { administrativeBody?: { type: AdministrativeBodyType } | null };
type Account = { administers: { personId: string | null; claimedAt: Date | null }[] } | null;

/** Pure: whether `account` may set the photo of a person with `roles`, `personId` null for a person not created yet. */
export function mayChangePersonImage(account: Account, roles: RoleOfPerson[], personId: string | null): boolean {
    if (hasPrimaryPresence(roles)) return true;
    return personId !== null && !!account?.administers.some(row => row.personId === personId && row.claimedAt !== null);
}

/** The roles as the rule reads them, from the ids a form sends. */
export async function rolesWithBodyType(roles: { administrativeBodyId?: string | null }[]): Promise<RoleOfPerson[]> {
    const ids = roles.map(role => role.administrativeBodyId).filter((id): id is string => !!id);
    const bodies = await prisma.administrativeBody.findMany({ where: { id: { in: ids } }, select: { id: true, type: true } });
    const typeOf = new Map(bodies.map(body => [body.id, body.type]));
    return roles.map(role => {
        const type = role.administrativeBodyId ? typeOf.get(role.administrativeBodyId) : undefined;
        return { administrativeBody: type ? { type } : null };
    });
}

/** The roles of a stored person, as the rule reads them. */
export async function rolesOfPerson(personId: string): Promise<RoleOfPerson[]> {
    const person = await prisma.person.findUnique({ where: { id: personId }, select: { roles: { select: { administrativeBody: { select: { type: true } } } } } });
    return person?.roles ?? [];
}

/** Refuses the write of a photo that the signed-in account may not set. */
export async function withPersonImageAuthorized(roles: RoleOfPerson[], personId: string | null): Promise<void> {
    if (!mayChangePersonImage(await getCurrentUser(), roles, personId)) {
        throw new ForbiddenError('Only the member adds their photo, from the account that claimed their page');
    }
}
