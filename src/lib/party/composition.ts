import type { AdministrativeBodyType } from '@prisma/client';
import type { PartyWithPersons, PersonWithRoles } from '@/lib/db/parties';
import { isActivePartyMember, isMayorRole, isRoleActive } from '@/lib/utils/roles';
import { sortPartyMembers } from '@/lib/sorting/people';

/**
 * What a party is made of, as the surfaces that show one describe it.
 *
 * The counts are per person, not per role: a councillor who also sits on two
 * committees is one member of the council and one member of the committees, not
 * three of anything. A person with no administrative body at all is counted in
 * `unassigned` — except the mayor, who has no body by construction (see
 * {@link isMayorRole}) and would otherwise read as an unplaced member.
 */
export interface PartyComposition {
    /** Members with an active role in the party, council members first. */
    members: PersonWithRoles[];
    /** The subset holding a seat on the council — `council` is its size. */
    councilMembers: PersonWithRoles[];
    council: number;
    committee: number;
    community: number;
    /** Members holding no administrative-body seat, the mayor excluded. */
    unassigned: number;
    /** Whether the city's mayor sits in this party — what makes it the governing one. */
    hasMayor: boolean;
}

export function partyComposition(party: PartyWithPersons): PartyComposition {
    const members = sortPartyMembers(
        party.people.filter(person => isActivePartyMember(person, party.id)),
        party.id,
        true,
    );

    // The same "only active roles count" rule as isActivePartyMember, applied to the
    // administrative-body seats: counting ended ones inflated the seat numeral and
    // left the governing-party chip on a previous mayor's party.
    const activeRoles = (person: PersonWithRoles) => person.roles.filter(isRoleActive);

    const counts = { committee: 0, community: 0 };
    const councilMembers: PersonWithRoles[] = [];
    for (const person of members) {
        const bodyTypes = new Set(
            activeRoles(person).filter(role => role.administrativeBody).map(role => role.administrativeBody!.type)
        );
        if (bodyTypes.has('council')) councilMembers.push(person);
        if (bodyTypes.has('committee')) counts.committee++;
        if (bodyTypes.has('community')) counts.community++;
    }

    const hasMayor = members.some(person => activeRoles(person).some(isMayorRole));
    // Excluded per person, not subtracted as a total: a mayor who also holds a council seat is
    // already outside `withoutBody`, so subtracting one for them dropped a genuinely unplaced
    // member from the count.
    const unassigned = members.filter(person => {
        const active = activeRoles(person);
        return !active.some(role => role.administrativeBodyId) && !active.some(isMayorRole);
    }).length;

    return {
        members,
        councilMembers,
        council: councilMembers.length,
        ...counts,
        unassigned,
        hasMayor,
    };
}

/** The bodies beyond the council that every card in a city should count. */
export interface PartyBodyColumns {
    committee: boolean;
    community: boolean;
}

/**
 * Which extra bodies are worth a figure on every card in this city.
 *
 * A type nobody holds an active seat on tells a reader nothing and costs a line
 * on every card — which also covers a municipality with no επιτροπές or no
 * κοινότητες at all, and a municipality whose committee exists on paper but
 * seats no one from any παράταξη.
 *
 * Computed across every party rather than per card, so the overview's top three
 * and the full tab never disagree about which figures a card carries. The seat
 * test matches {@link partyComposition}: an active role on a body, held by
 * someone with an active role in the party.
 */
export function partyBodyColumns(parties: PartyWithPersons[]): PartyBodyColumns {
    const present = new Set<AdministrativeBodyType>();
    for (const party of parties) {
        for (const person of party.people) {
            if (!isActivePartyMember(person, party.id)) continue;
            for (const role of person.roles) {
                if (isRoleActive(role) && role.administrativeBody) present.add(role.administrativeBody.type);
            }
        }
    }
    return { committee: present.has('committee'), community: present.has('community') };
}
