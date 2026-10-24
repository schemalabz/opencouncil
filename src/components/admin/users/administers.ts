import type { AdminEntity } from "@/lib/db/adminEntities"
import type { UserWithAdministers } from "@/lib/db/types"

/** What an account administers, labelled as the admin user tools show it. */
export function mapAdministersToEntities(administers: UserWithAdministers['administers']): AdminEntity[] {
    if (!administers) return []

    const entities: AdminEntity[] = []

    for (const a of administers) {
        if (a.city) {
            entities.push({
                id: a.city.id,
                name: a.city.name,
                displayName: a.city.name,
                type: 'city'
            })
        } else if (a.party?.city) {
            entities.push({
                id: a.party.id,
                name: a.party.name,
                displayName: `${a.party.city.name} / ${a.party.name}`,
                type: 'party',
                city: a.party.city
            })
        } else if (a.person?.city) {
            entities.push({
                id: a.person.id,
                name: a.person.name,
                displayName: `${a.person.city.name} / ${a.person.name}`,
                type: 'person',
                city: a.person.city
            })
        } else if (a.administrativeBody?.city) {
            entities.push({
                id: a.administrativeBody.id,
                name: a.administrativeBody.name,
                displayName: `${a.administrativeBody.city.name} / ${a.administrativeBody.name}`,
                type: 'body',
                city: a.administrativeBody.city
            })
        }
    }

    return entities
}
