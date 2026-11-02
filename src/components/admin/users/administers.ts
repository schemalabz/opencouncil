import type { GrantRole } from "@prisma/client"
import type { AdminEntity, AdminEntityType } from "@/lib/db/adminEntities"
import type { UserWithAdministers } from "@/lib/db/types"
import { getRealmDomain } from "@/lib/realm"

/** A grant as the admin user tools show and edit it: a role on one entity. */
export type GrantEntry = {
    /** One per (entity, role): the key of a badge, and what a remove acts on. */
    key: string
    role: GrantRole
    entity: AdminEntity
}

export const grantKey = (entity: Pick<AdminEntity, 'type' | 'id'>, role: GrantRole): string => `${entity.type}:${entity.id}:${role}`

export const GRANT_TYPE_ICON: Record<AdminEntityType, string> = {
    realm: '🌍',
    city: '🏛️',
    party: '👥',
    person: '👤',
    body: '🏢',
}

const entityOf = (a: UserWithAdministers['administers'][number]): AdminEntity | null => {
    if (a.realm) return { id: a.realm, name: a.realm, type: 'realm', displayName: getRealmDomain(a.realm) }
    if (a.city) return { id: a.city.id, name: a.city.name, displayName: a.city.name, type: 'city' }
    if (a.party?.city) return { id: a.party.id, name: a.party.name, displayName: `${a.party.city.name} / ${a.party.name}`, type: 'party', city: a.party.city }
    if (a.person?.city) return { id: a.person.id, name: a.person.name, displayName: `${a.person.city.name} / ${a.person.name}`, type: 'person', city: a.person.city }
    if (a.administrativeBody?.city) {
        return { id: a.administrativeBody.id, name: a.administrativeBody.name, displayName: `${a.administrativeBody.city.name} / ${a.administrativeBody.name}`, type: 'body', city: a.administrativeBody.city }
    }
    return null
}

/** What an account holds, labelled as the admin user tools show it. */
export function mapAdministersToGrants(administers: UserWithAdministers['administers']): GrantEntry[] {
    if (!administers) return []
    const grants: GrantEntry[] = []
    for (const a of administers) {
        const entity = entityOf(a)
        if (entity) grants.push({ key: grantKey(entity, a.role), role: a.role, entity })
    }
    return grants
}
