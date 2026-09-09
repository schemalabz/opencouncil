import type { AdministrativeBody, AdministrativeBodyType, Role } from '@prisma/client';
import { administrativeBodyTypeRank, compareAdministrativeBodies } from '@/lib/utils/administrativeBodies';
import { getSurname } from '@/lib/formatters/name';
import { filterActiveRoles, isActivePartyRole, isMayor } from '@/lib/utils/roles';

/**
 * How people are ordered, everywhere they are listed.
 *
 * One field decides the order: `Role.electedOrder`, the elected order of a seat
 * on an administrative body. The rules read it the same way on every surface:
 *
 * - In one body: the mayor, then the chair, then elected order, then surname.
 * - In one party: the mayor, then the party head, then the members by the body
 *   they sit on (council, committee, community, none), then elected order in
 *   that body, then surname.
 * - Across a city: the mayor, then each body in turn with its own order, then
 *   everyone else by surname. A person appears once, with the first body they
 *   sit on. With a body type selected, only the bodies of that type place
 *   people, so a page filtered to the committees lists them in committee order.
 *
 * `electedOrder` carries the whole order of a body's list, and this module adds
 * nothing to it beyond the mayor and the chair. A municipality publishes its
 * council in party blocks, so the fill that writes these numbers puts the blocks
 * in them. Two rules are deliberately absent here:
 *
 * - Grouping by party. A rule could group the members, but it could not place an
 *   Αντιπρόεδρος or a Γραμματέας, who belong to a party and yet sit above every
 *   block. `Role.isHead` marks the chair alone, no other field marks an officer,
 *   and the role's name is text a municipality writes, not a signal to match on.
 *   A grouping rule would therefore fix one half of the order and break the
 *   other. The numbers hold both.
 * - Any ordering of the parties. The fill decides it, so a municipality that
 *   publishes an order of its own keeps it.
 *
 * The minutes read `electedOrder` through {@link getElectedOrderForBody} and
 * {@link compareRanks} and nothing else, so the order a page shows and the
 * order the minutes print come from the same numbers.
 */

/**
 * The role fields the ordering reads, taken from the Prisma row rather than
 * re-spelled. `administrativeBody` is required because the body's type and name
 * place a person: a caller that left it out would sort every seat as no seat,
 * and nothing would report the loss.
 */
export type OrderedRole = Pick<
    Role,
    'isHead' | 'cityId' | 'partyId' | 'administrativeBodyId' | 'electedOrder' | 'startDate' | 'endDate'
> & {
    administrativeBody: Pick<AdministrativeBody, 'id' | 'name' | 'type'> | null;
};

export interface OrderedPerson {
    id: string;
    name: string;
    roles: OrderedRole[];
}

/**
 * Get the elected order for a person within a specific administrative body.
 * Returns null if the person has no role with elected order in that body.
 */
export function getElectedOrderForBody(
    person: OrderedPerson | undefined,
    administrativeBodyId: string | null,
): number | null {
    if (!person || !administrativeBodyId) return null;
    const role = person.roles.find(
        r => r.administrativeBodyId === administrativeBodyId && r.electedOrder != null
    );
    return role?.electedOrder ?? null;
}

/**
 * Compares two order values (ascending, nulls last)
 */
export const compareRanks = (aRank: number | null, bRank: number | null): number => {
    if (aRank !== null && bRank !== null) return aRank - bRank;
    if (aRank !== null) return -1;
    if (bRank !== null) return 1;
    return 0;
};

/** True sorts before false. */
const compareFlags = (a: boolean, b: boolean): number => (a === b ? 0 : a ? -1 : 1);

const compareByLastName = (a: OrderedPerson, b: OrderedPerson): number =>
    getSurname(a.name).localeCompare(getSurname(b.name)) || a.name.localeCompare(b.name);

/**
 * Sorts an array of Person objects by the last word in their name (typically last name)
 */
export const sortPersonsByLastName = <T extends OrderedPerson>(persons: T[]): T[] => {
    return [...persons].sort(compareByLastName);
};

const activeRoles = (person: OrderedPerson): OrderedRole[] => filterActiveRoles(person.roles);

const bodyRole = (person: OrderedPerson, administrativeBodyId: string): OrderedRole | null =>
    activeRoles(person).find(role => role.administrativeBodyId === administrativeBodyId) ?? null;

/**
 * The seat that places a person, and their elected order on it.
 *
 * The seat is the first body they sit on, in the order {@link sortPeople} walks
 * the bodies: type first, then body name. Both surfaces read it through here,
 * so a person on two bodies of one type takes the same position in a party list
 * as in the city list. Reading the lowest order across those bodies instead put
 * the two lists in different orders, with no test and no failure to show it.
 */
function seat(person: OrderedPerson): { typeRank: number; electedOrder: number | null } {
    let placing: OrderedRole | null = null;
    for (const role of activeRoles(person)) {
        const body = role.administrativeBody;
        if (!body) continue;
        if (placing === null || compareAdministrativeBodies(body, placing.administrativeBody!) < 0) {
            placing = role;
        }
    }
    return {
        typeRank: administrativeBodyTypeRank(placing?.administrativeBody?.type),
        electedOrder: placing?.electedOrder ?? null,
    };
}

/** Sorts by precomputed keys, so the comparator never re-reads the roles. */
function sortWithKeys<T, K>(items: T[], key: (item: T) => K, compare: (a: K, b: K) => number): T[] {
    return items
        .map(item => ({ item, key: key(item) }))
        .sort((a, b) => compare(a.key, b.key))
        .map(({ item }) => item);
}

/**
 * The members of one administrative body: the mayor, then the chair, then
 * elected order, then surname. Someone in the list without a seat on the body
 * (a deputy mayor listed with the council) sorts after the members.
 *
 * The elected order carries the party blocks, so two members of one party are
 * adjacent because their numbers are adjacent, not because this function put
 * them together.
 */
export function sortBodyMembers<T extends OrderedPerson>(people: T[], administrativeBodyId: string): T[] {
    return sortWithKeys(
        people,
        person => {
            const role = bodyRole(person, administrativeBodyId);
            return {
                person,
                mayor: isMayor(person),
                member: role !== null,
                chair: role?.isHead ?? false,
                electedOrder: role?.electedOrder ?? null,
            };
        },
        (a, b) =>
            compareFlags(a.mayor, b.mayor)
            || compareFlags(a.member, b.member)
            || compareFlags(a.chair, b.chair)
            || compareRanks(a.electedOrder, b.electedOrder)
            || compareByLastName(a.person, b.person),
    );
}

/**
 * The members of one party: the mayor, then the party head, then by the body
 * they sit on (council first), then elected order in that body, then surname.
 */
export function sortPartyMembers<T extends OrderedPerson>(people: T[], partyId: string): T[] {
    return sortWithKeys(
        people,
        person => ({
            person,
            mayor: isMayor(person),
            head: person.roles.some(role => isActivePartyRole(role, partyId) && role.isHead),
            ...seat(person),
        }),
        (a, b) =>
            compareFlags(a.mayor, b.mayor)
            || compareFlags(a.head, b.head)
            || a.typeRank - b.typeRank
            || compareRanks(a.electedOrder, b.electedOrder)
            || compareByLastName(a.person, b.person),
    );
}

/**
 * Everyone in a city: the mayor, then each administrative body in turn
 * (council, then committees, then communities, each in its own order), then
 * everyone else by surname. A person appears once, with the first body they
 * sit on. The bodies come from the people's current roles.
 *
 * With `bodyType`, only the bodies of that type place people. A list filtered
 * to one type then follows that type's order even when the same people also
 * sit on the council.
 */
export function sortPeople<T extends OrderedPerson>(people: T[], bodyType?: AdministrativeBodyType): T[] {
    const bodies = new Map<string, { id: string; name: string; type: AdministrativeBodyType }>();
    for (const person of people) {
        for (const role of activeRoles(person)) {
            const body = role.administrativeBody;
            if (body && (!bodyType || body.type === bodyType) && !bodies.has(body.id)) {
                bodies.set(body.id, body);
            }
        }
    }
    const orderedBodies = [...bodies.values()].sort(compareAdministrativeBodies);

    const placed = new Set<string>();
    const result: T[] = [];
    const place = (group: T[]) => {
        for (const person of group) {
            placed.add(person.id);
            result.push(person);
        }
    };

    place(sortPersonsByLastName(people.filter(isMayor)));
    for (const body of orderedBodies) {
        const members = people.filter(person => !placed.has(person.id) && bodyRole(person, body.id));
        place(sortBodyMembers(members, body.id));
    }
    place(sortPersonsByLastName(people.filter(person => !placed.has(person.id))));

    return result;
}

/**
 * Sorts inactive party members by most recent end date, then by name
 */
export const sortInactivePartyMembers = <T extends OrderedPerson>(
    people: T[],
    partyId: string
): T[] => {
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
