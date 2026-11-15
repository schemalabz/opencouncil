// Who may set the photo of a person (#829). A person whose every role is on
// a youth council, where members can be under 18, adds their photo from
// their own account only: the account that claimed their page. Nobody adds
// the photo of such a person who has no page yet. Anyone who may edit a
// person with any other role sets their photo, as
// before. The privacy page promises this.
import "server-only";
import type { AdministrativeBodyType } from '@prisma/client';
import prisma from './prisma';
import { getCurrentUser } from '@/lib/auth';
import { ConflictError, ForbiddenError } from '@/lib/api/errors';
import { youthCouncilOnly } from '@/lib/utils/youthCouncil';
import { vmsg } from '@/lib/zod-schemas/messages';

export type RoleOfPerson = { administrativeBody?: { type: AdministrativeBodyType } | null };
type Account = { administers: { personId: string | null; claimedAt: Date | null }[] } | null;

/** Pure: whether `account` may set the photo of a person with `roles`, `personId` null for a person not created yet. */
export function mayChangePersonImage(account: Account, roles: RoleOfPerson[], personId: string | null): boolean {
    if (!youthCouncilOnly(roles)) return true;
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

/** Refuses the write of a photo that the signed-in account may not set. */
export async function withPersonImageAuthorized(roles: RoleOfPerson[], personId: string | null): Promise<void> {
    if (!mayChangePersonImage(await getCurrentUser(), roles, personId)) {
        throw new ForbiddenError('Only the member adds their photo, from the account that claimed their page');
    }
}

/**
 * The rule on an edit of a stored person, decided on the person after the
 * write. A new photo needs the rule, and so does a change of roles that
 * makes a person who keeps a photo youth-only: an admin could otherwise
 * set the photo while the person has another role, then remove that role.
 * That change answers 409, a conflict with the stored photo: the admin may
 * edit the person, and the message names the two ways to save.
 * `image` is the new photo, null to remove it, absent to keep it; `roles`
 * replace every role, absent to keep them.
 */
export async function withPersonImageKept(
    personId: string,
    write: { image?: File | string | null; roles?: { administrativeBodyId?: string | null }[] },
): Promise<void> {
    if (write.image === null) return;
    const person = await prisma.person.findUnique({
        where: { id: personId },
        select: { image: true, roles: { select: { administrativeBody: { select: { type: true } } } } },
    });
    const before = person?.roles ?? [];
    const after = write.roles ? await rolesWithBodyType(write.roles) : before;
    if (write.image) return withPersonImageAuthorized(after, personId);
    const becomesYouthOnly = !!person?.image && youthCouncilOnly(after) && !youthCouncilOnly(before);
    if (becomesYouthOnly && !mayChangePersonImage(await getCurrentUser(), after, personId)) {
        throw new ConflictError(vmsg('youthOnlyPersonPhoto'));
    }
}
