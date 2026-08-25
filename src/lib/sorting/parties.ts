import type { PartyWithPersons } from '@/lib/db/parties';
import { isRoleActive } from '@/lib/utils/roles';

/**
 * Display order for a city's parties: largest first, then the ones that have a
 * head, then alphabetically.
 *
 * Member count leads because seat share is what a reader is comparing; the head
 * tiebreak separates a real παράταξη from a group of independents that happens to
 * hold the same number of seats.
 */
export function sortParties<T extends PartyWithPersons>(parties: T[]): T[] {
    // Ranked on the figure the card prints — council seats where a party holds
    // any, its roster otherwise. Ordering by roster size while the cards showed
    // seats put a card reading "2 έδρες" above one reading "8 έδρες", and could
    // cut the largest council group out of the overview's top three.
    // Measured once per party rather than inside the comparator, which runs
    // O(n log n) times.
    const sizes = new Map(parties.map(party => [party.id, displayedSize(party)]));
    return [...parties].sort((a, b) => {
        const memberCountDiff = (sizes.get(b.id) ?? 0) - (sizes.get(a.id) ?? 0);
        if (memberCountDiff !== 0) return memberCountDiff;

        const aHasHead = partyHasHead(a);
        const bHasHead = partyHasHead(b);
        if (aHasHead && !bHasHead) return -1;
        if (!aHasHead && bHasHead) return 1;

        return a.name.localeCompare(b.name);
    });
}

/** The number PartyCard shows: active council seats, or the roster when it holds none. */
function displayedSize(party: PartyWithPersons): number {
    const seats = party.people.filter(person =>
        person.roles.some(role => role.administrativeBody?.type === 'council' && isRoleActive(role)),
    ).length;
    return seats > 0 ? seats : party.people.length;
}

function partyHasHead(party: PartyWithPersons): boolean {
    return party.people.some(person =>
        person.roles.some(role => role.partyId === party.id && role.isHead)
    );
}
