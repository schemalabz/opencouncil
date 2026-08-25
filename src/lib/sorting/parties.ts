import type { PartyWithPersons } from '@/lib/db/parties';

/**
 * Display order for a city's parties: largest first, then the ones that have a
 * head, then alphabetically.
 *
 * Member count leads because seat share is what a reader is comparing; the head
 * tiebreak separates a real παράταξη from a group of independents that happens to
 * hold the same number of seats.
 */
export function sortParties<T extends PartyWithPersons>(parties: T[]): T[] {
    return [...parties].sort((a, b) => {
        const memberCountDiff = b.people.length - a.people.length;
        if (memberCountDiff !== 0) return memberCountDiff;

        const aHasHead = partyHasHead(a);
        const bHasHead = partyHasHead(b);
        if (aHasHead && !bHasHead) return -1;
        if (!aHasHead && bHasHead) return 1;

        return a.name.localeCompare(b.name);
    });
}

function partyHasHead(party: PartyWithPersons): boolean {
    return party.people.some(person =>
        person.roles.some(role => role.partyId === party.id && role.isHead)
    );
}
