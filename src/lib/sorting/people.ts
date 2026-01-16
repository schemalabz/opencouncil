import { PersonWithRelations } from '@/lib/db/people';
import { PartyWithPersons } from '@/lib/db/parties';
import { PeopleOrdering } from '@prisma/client';
import { getActivePartyRole } from '@/lib/utils';

/**
 * Sorts an array of Person objects by the last word in their name (typically last name)
 */
export const sortPersonsByLastName = (persons: PersonWithRelations[]): PersonWithRelations[] => {
    return [...persons].sort((a, b) => {
        const aLastWord = a.name.split(" ").pop() || "";
        const bLastWord = b.name.split(" ").pop() || "";
        return aLastWord.localeCompare(bLastWord);
    });
};

/**
 * Compares two rank values (ascending, nulls last)
 */
export const compareRanks = (aRank: number | null, bRank: number | null): number => {
    if (aRank !== null && bRank !== null) return aRank - bRank;
    if (aRank !== null) return -1;
    if (bRank !== null) return 1;
    return 0;
};

/**
 * Sorts party members by: council members first, then head status (optional), then rank, then name
 */
export const sortPartyMembers = (
    people: PersonWithRelations[],
    partyId: string,
    prioritizeHead: boolean = false
): PersonWithRelations[] => {
    return [...people].sort((a, b) => {
        const aRole = getActivePartyRole(a.roles, partyId);
        const bRole = getActivePartyRole(b.roles, partyId);

        // Sort by council membership first (council members appear first)
        const aIsCouncil = a.roles.some(role =>
            role.administrativeBody?.type === 'council'
        );
        const bIsCouncil = b.roles.some(role =>
            role.administrativeBody?.type === 'council'
        );
        if (aIsCouncil && !bIsCouncil) return -1;
        if (!aIsCouncil && bIsCouncil) return 1;

        // Then sort by isHead if enabled
        if (prioritizeHead) {
            const aIsHead = aRole?.isHead ?? false;
            const bIsHead = bRole?.isHead ?? false;
            if (aIsHead && !bIsHead) return -1;
            if (!aIsHead && bIsHead) return 1;
        }

        // Then sort by rank
        const rankCompare = compareRanks(aRole?.rank ?? null, bRole?.rank ?? null);
        if (rankCompare !== 0) return rankCompare;

        // Finally sort by name
        return a.name.localeCompare(b.name);
    });
};

/**
 * Groups people by their active party affiliation
 * @param people Array of people to group
 * @param groupBy Whether to group by party 'id' or 'name' (default: 'id')
 * @returns Record with party ID/name as key and array of people as value
 */
export const groupPeopleByActiveParty = (
    people: PersonWithRelations[],
    groupBy: 'id' | 'name' = 'id'
): Record<string, PersonWithRelations[]> => {
    return people.reduce((acc, person) => {
        const partyRole = getActivePartyRole(person.roles); // Only active roles
        
        let key: string;
        if (groupBy === 'id') {
            key = partyRole?.partyId || '_no_party';
        } else {
            key = partyRole?.party?.name || "Ανεξάρτητοι";
        }
        
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(person);
        return acc;
    }, {} as Record<string, PersonWithRelations[]>);
};

/**
 * Sorts inactive party members by most recent end date, then by name
 */
export const sortInactivePartyMembers = (
    people: PersonWithRelations[],
    partyId: string
): PersonWithRelations[] => {
    return [...people].sort((a, b) => {
        // Sort by most recent end date first
        const aEnd = Math.max(...a.roles
            .filter(role => role.partyId === partyId && role.endDate)
            .map(role => role.endDate ? new Date(role.endDate).getTime() : 0));
        const bEnd = Math.max(...b.roles
            .filter(role => role.partyId === partyId && role.endDate)
            .map(role => role.endDate ? new Date(role.endDate).getTime() : 0));
        
        if (aEnd !== bEnd) return bEnd - aEnd;
        
        // Then sort by name
        return a.name.localeCompare(b.name);
    });
};

/**
 * Sorts people based on the specified ordering preference
 * - 'partyRank': sorts by party (by member count), then by rank within party
 * - 'default': sorts by last name (default)
 */
export const sortPeople = (
    persons: PersonWithRelations[],
    parties: PartyWithPersons[],
    peopleOrdering: PeopleOrdering = 'default'
): PersonWithRelations[] => {
    if (peopleOrdering !== 'partyRank') {
        return sortPersonsByLastName(persons);
    }

    // Group people by party ID using the shared helper
    const peopleByParty = groupPeopleByActiveParty(persons, 'id');
    
    // Ensure all parties are initialized (even if empty)
    parties.forEach(party => {
        if (!peopleByParty[party.id]) {
            peopleByParty[party.id] = [];
        }
    });

    // Sort parties by member count (descending)
    const sortedParties = [...parties].sort((a, b) => {
        const aCount = peopleByParty[a.id]?.length || 0;
        const bCount = peopleByParty[b.id]?.length || 0;
        return bCount - aCount;
    });

    // Sort people within each party and flatten
    const sortedPeople: PersonWithRelations[] = [];

    sortedParties.forEach(party => {
        const partyPeople = peopleByParty[party.id] || [];
        const sortedPartyPeople = sortPartyMembers(partyPeople, party.id, false);
        sortedPeople.push(...sortedPartyPeople);
    });

    // Add people without parties at the end
    const noPartyPeople = peopleByParty['_no_party'] || [];
    const sortedNoPartyPeople = sortPersonsByLastName(noPartyPeople);
    sortedPeople.push(...sortedNoPartyPeople);

    return sortedPeople;
};

