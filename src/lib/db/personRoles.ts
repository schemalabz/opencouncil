import "server-only";
import type { PersonRoleOutput } from '@/lib/zod-schemas/person';
import { getPartiesForCity } from './parties';
import { getPublicAdministrativeBodiesForCity } from './administrativeBodies';
import { validateRoles, validateRolesForBodyAdmin, type RoleValidationError } from '@/lib/utils/roles';

/**
 * Checks the roles that the person form sends. Every party and body must be
 * one of the city. With a `roleLimit` (getRoleLimitForCity), a body admin
 * gives roles on the bodies of the limit only. Null when the roles pass.
 */
export async function validatePersonRoles(
    cityId: string,
    roles: PersonRoleOutput[],
    roleLimit: ReadonlySet<string> | null,
): Promise<RoleValidationError | null> {
    const [parties, administrativeBodies] = await Promise.all([
        getPartiesForCity(cityId),
        getPublicAdministrativeBodiesForCity(cityId),
    ]);
    const validPartyIds = new Set(parties.map(party => party.id));
    const validAdminBodyIds = new Set(administrativeBodies.map(body => body.id));
    return validateRoles(roles, cityId, validPartyIds, validAdminBodyIds)
        ?? (roleLimit ? validateRolesForBodyAdmin(roles, roleLimit) : null);
}
