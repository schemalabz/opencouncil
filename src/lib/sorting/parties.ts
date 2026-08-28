import type { PartyWithPersons } from '@/lib/db/parties';
import { getLocalizedName } from '@/lib/formatters/name';
import { isRoleActive } from '@/lib/utils/roles';

/**
 * Display order for a city's parties: most council seats first, then the ones
 * that have a head, then alphabetically.
 *
 * Seats lead because seat share is what a reader is comparing; the head
 * tiebreak separates a real παράταξη from a group of independents that happens to
 * hold the same number of seats.
 */
export function sortParties<T extends PartyWithPersons>(parties: T[], locale?: string): T[] {
    // Strictly council seats — no roster fallback. A party whose councillors
    // have all resigned holds none, and ranking it on the people still on its
    // books put a card reading "0 έδρες" third in a list led by 26 and 9. A
    // party with no seat now sorts below every party that has one, which is
    // what the numeral on its card says.
    // Measured once per party rather than inside the comparator, which runs
    // O(n log n) times.
    const sizes = new Map(parties.map(party => [party.id, councilSeats(party)]));
    const label = (party: T) => displayName(party, locale);
    return [...parties].sort((a, b) => {
        const memberCountDiff = (sizes.get(b.id) ?? 0) - (sizes.get(a.id) ?? 0);
        if (memberCountDiff !== 0) return memberCountDiff;

        const aHasHead = partyHasHead(a);
        const bHasHead = partyHasHead(b);
        if (aHasHead && !bHasHead) return -1;
        if (!aHasHead && bHasHead) return 1;

        // The name the card prints, not the stored Greek one. Sorting on
        // `party.name` under /en ordered two equal-seat parties by a string the
        // reader cannot see — and the overview band cuts that order at three.
        return label(a).localeCompare(label(b), locale);
    });
}

/** What the card prints for this party, which is what the tiebreak must order. */
function displayName(party: PartyWithPersons, locale?: string): string {
    return locale ? getLocalizedName(party, locale) : party.name;
}

/**
 * The number PartyCard shows: members of this party holding an active council seat.
 *
 * Both halves are load-bearing, and they are the same two tests partyComposition applies — a
 * councillor who left the παράταξη keeps their seat, and `getPartiesForCity` filters the party's
 * own roles relation but not the nested `person.roles`, so they are still listed here. Counting
 * their seat ranked a party above one whose card prints a larger numeral.
 */
function councilSeats(party: PartyWithPersons): number {
    return party.people.filter(person =>
        person.roles.some(role => role.partyId === party.id && isRoleActive(role)) &&
        person.roles.some(role => role.administrativeBody?.type === 'council' && isRoleActive(role)),
    ).length;
}

function partyHasHead(party: PartyWithPersons): boolean {
    return party.people.some(person =>
        person.roles.some(role => role.partyId === party.id && role.isHead)
    );
}
