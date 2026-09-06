import {
    compareRanks,
    getElectedOrderForBody,
    sortBodyMembers,
    sortPartyMembers,
    sortPeople,
    sortPersonsByLastName,
    type OrderedPerson,
    type OrderedRole,
} from '../people';

const OPEN = { startDate: null, endDate: null };
const ENDED = { startDate: null, endDate: new Date('2020-01-01') };

const COUNCIL = { id: 'council', name: 'Δημοτικό Συμβούλιο', type: 'council' as const };
const COMMITTEE = { id: 'committee', name: 'Δημοτική Επιτροπή', type: 'committee' as const };
const COMMITTEE_B = { id: 'committee-b', name: 'Επιτροπή Ποιότητας Ζωής', type: 'committee' as const };
const COMMUNITY = { id: 'community', name: 'Κοινότητα', type: 'community' as const };

type BodyRef = NonNullable<OrderedRole['administrativeBody']>;

/** Only the fields the ordering reads — the full Prisma shape is irrelevant here. */
function role(fields: Partial<OrderedRole> & { body?: BodyRef }): OrderedRole {
    const { body, ...rest } = fields;
    return {
        isHead: false,
        cityId: null,
        partyId: null,
        administrativeBodyId: body?.id ?? null,
        administrativeBody: body ?? null,
        party: null,
        electedOrder: null,
        ...OPEN,
        ...rest,
    };
}

const seat = (body: BodyRef, electedOrder: number | null = null, extra: Partial<OrderedRole> = {}) =>
    role({ body, electedOrder, ...extra });
const partyRole = (partyId: string, isHead = false, dates: Partial<OrderedRole> = OPEN) =>
    role({ partyId, party: { id: partyId, name: partyId }, isHead, ...dates });
const mayorRole = () => role({ cityId: 'athens', isHead: true });

function person(id: string, name: string, roles: OrderedRole[]): OrderedPerson {
    return { id, name, roles };
}

const names = (people: OrderedPerson[]) => people.map(p => p.id);

describe('compareRanks', () => {
    it('sorts ascending with nulls last', () => {
        expect([3, null, 1, 2].sort(compareRanks)).toEqual([1, 2, 3, null]);
    });
});

describe('getElectedOrderForBody', () => {
    it('reads the order of the role on that body only', () => {
        const p = person('a', 'A', [seat(COUNCIL, 4), seat(COMMITTEE, 1)]);
        expect(getElectedOrderForBody(p, COUNCIL.id)).toBe(4);
        expect(getElectedOrderForBody(p, COMMITTEE.id)).toBe(1);
        expect(getElectedOrderForBody(p, COMMUNITY.id)).toBeNull();
        expect(getElectedOrderForBody(undefined, COUNCIL.id)).toBeNull();
        expect(getElectedOrderForBody(p, null)).toBeNull();
    });
});

describe('sortPersonsByLastName', () => {
    it('orders by the last word of the name', () => {
        const people = [
            person('b', 'Γιώργος Βασιλείου', []),
            person('a', 'Μαρία Αντωνίου', []),
            person('c', 'Άννα Βασιλείου', []),
        ];
        expect(names(sortPersonsByLastName(people))).toEqual(['a', 'c', 'b']);
    });
});

describe('sortBodyMembers', () => {
    it('puts the mayor first, then the chair, then elected order, then surname', () => {
        const people = [
            person('late', 'Ζήσης Ωμέγα', [seat(COUNCIL)]),
            person('third', 'Νίκος Γάμμα', [seat(COUNCIL, 3)]),
            person('chair', 'Πέτρος Πρόεδρος', [seat(COUNCIL, 7, { isHead: true })]),
            person('second', 'Ελένη Βήτα', [seat(COUNCIL, 2)]),
            person('mayor', 'Δήμος Δήμαρχος', [mayorRole(), seat(COUNCIL, 9)]),
            person('early', 'Άννα Άλφα', [seat(COUNCIL)]),
        ];
        expect(names(sortBodyMembers(people, COUNCIL.id))).toEqual(['mayor', 'chair', 'second', 'third', 'early', 'late']);
    });

    it('groups the members by party, the first-elected party first', () => {
        // The shape a Greek council carries: the order of election runs across
        // the parties, so the numbers alone would interleave them.
        const people = [
            person('a1', 'Άλφα Ένα', [partyRole('alpha'), seat(COUNCIL, 1)]),
            person('b1', 'Βήτα Ένα', [partyRole('beta'), seat(COUNCIL, 2)]),
            person('a2', 'Άλφα Δύο', [partyRole('alpha'), seat(COUNCIL, 3)]),
            person('b2', 'Βήτα Δύο', [partyRole('beta'), seat(COUNCIL, 4)]),
        ];
        expect(names(sortBodyMembers(people, COUNCIL.id))).toEqual(['a1', 'a2', 'b1', 'b2']);
    });

    it('closes the list with the members who hold no party', () => {
        const people = [
            person('independent', 'Άλφα Άλφα', [seat(COUNCIL, 1)]),
            person('member', 'Ωμέγα Ωμέγα', [partyRole('alpha'), seat(COUNCIL, 2)]),
        ];
        expect(names(sortBodyMembers(people, COUNCIL.id))).toEqual(['member', 'independent']);
    });

    it('sorts a party whose members carry no number after the parties that do', () => {
        const people = [
            person('unnumbered', 'Άλφα Άλφα', [partyRole('beta'), seat(COUNCIL)]),
            person('numbered', 'Ωμέγα Ωμέγα', [partyRole('alpha'), seat(COUNCIL, 9)]),
        ];
        expect(names(sortBodyMembers(people, COUNCIL.id))).toEqual(['numbered', 'unnumbered']);
    });

    it('keeps the mayor and the chair before the party blocks', () => {
        const people = [
            person('member', 'Άλφα Άλφα', [partyRole('alpha'), seat(COUNCIL, 1)]),
            person('chair', 'Βήτα Βήτα', [partyRole('beta'), seat(COUNCIL, 8, { isHead: true })]),
            person('mayor', 'Ωμέγα Ωμέγα', [mayorRole(), partyRole('beta'), seat(COUNCIL, 5)]),
        ];
        expect(names(sortBodyMembers(people, COUNCIL.id))).toEqual(['mayor', 'chair', 'member']);
    });

    it('puts every member, numbered or not, before someone with no seat on the body', () => {
        const people = [
            person('deputy', 'Άννα Άλφα', [role({ cityId: 'athens' })]),
            person('unnumbered', 'Ζήσης Ωμέγα', [seat(COUNCIL)]),
            person('member', 'Μαρία Μι', [seat(COUNCIL, 5)]),
        ];
        expect(names(sortBodyMembers(people, COUNCIL.id))).toEqual(['member', 'unnumbered', 'deputy']);
    });

    it('ignores a seat that has ended', () => {
        const people = [
            person('former-chair', 'Άννα Άλφα', [seat(COUNCIL, 1, { isHead: true, ...ENDED })]),
            person('member', 'Ζήσης Ωμέγα', [seat(COUNCIL, 5)]),
        ];
        expect(names(sortBodyMembers(people, COUNCIL.id))).toEqual(['member', 'former-chair']);
    });

    it('reads the order of the body asked for, not another one', () => {
        const people = [
            person('a', 'Άννα Άλφα', [seat(COUNCIL, 1), seat(COMMITTEE, 9)]),
            person('b', 'Ζήσης Ωμέγα', [seat(COUNCIL, 2), seat(COMMITTEE, 1)]),
        ];
        expect(names(sortBodyMembers(people, COUNCIL.id))).toEqual(['a', 'b']);
        expect(names(sortBodyMembers(people, COMMITTEE.id))).toEqual(['b', 'a']);
    });

    it('does not mutate the input', () => {
        const people = [person('b', 'B', [seat(COUNCIL, 2)]), person('a', 'A', [seat(COUNCIL, 1)])];
        sortBodyMembers(people, COUNCIL.id);
        expect(names(people)).toEqual(['b', 'a']);
    });
});

describe('sortPartyMembers', () => {
    const PARTY = 'party';

    it('puts the head first even without a council seat', () => {
        const people = [
            person('councillor', 'Άννα Άλφα', [partyRole(PARTY), seat(COUNCIL, 1)]),
            person('head', 'Ζήσης Ωμέγα', [partyRole(PARTY, true), seat(COMMITTEE, 1)]),
        ];
        expect(names(sortPartyMembers(people, PARTY))).toEqual(['head', 'councillor']);
    });

    it('puts the mayor before everyone, the head included', () => {
        const people = [
            person('head', 'Άννα Άλφα', [partyRole(PARTY, true), seat(COUNCIL, 1)]),
            person('mayor', 'Ζήσης Ωμέγα', [partyRole(PARTY), mayorRole()]),
        ];
        expect(names(sortPartyMembers(people, PARTY))).toEqual(['mayor', 'head']);
    });

    it('orders by body — council, committee, community, none — then elected order, then surname', () => {
        const people = [
            person('none', 'Άννα Άλφα', [partyRole(PARTY)]),
            person('community', 'Βασίλης Βήτα', [partyRole(PARTY), seat(COMMUNITY, 1)]),
            person('committee', 'Γιάννης Γάμμα', [partyRole(PARTY), seat(COMMITTEE, 1)]),
            person('council-2', 'Δήμητρα Δέλτα', [partyRole(PARTY), seat(COUNCIL, 2)]),
            person('council-1', 'Ζήσης Ωμέγα', [partyRole(PARTY), seat(COUNCIL, 1), seat(COMMITTEE, 2)]),
            person('council-unordered', 'Ελένη Έψιλον', [partyRole(PARTY), seat(COUNCIL)]),
        ];
        expect(names(sortPartyMembers(people, PARTY))).toEqual([
            'council-1', 'council-2', 'council-unordered', 'committee', 'community', 'none',
        ]);
    });

    it('falls back to surname between members of one body with no elected order', () => {
        const people = [
            person('omega', 'Ζήσης Ωμέγα', [partyRole(PARTY), seat(COUNCIL)]),
            person('alpha', 'Άννα Άλφα', [partyRole(PARTY), seat(COUNCIL)]),
        ];
        expect(names(sortPartyMembers(people, PARTY))).toEqual(['alpha', 'omega']);
    });

    it('places a member of two bodies of one type by the first of them, as the city order does', () => {
        const people = [
            // The later body first, so a reader that takes whichever seat comes
            // first in the array picks the wrong one.
            person('two-committees', 'Ζήσης Ωμέγα', [partyRole(PARTY), seat(COMMITTEE_B, 1), seat(COMMITTEE, 5)]),
            person('one-committee', 'Άννα Άλφα', [partyRole(PARTY), seat(COMMITTEE, 2)]),
        ];
        // 'Δημοτική Επιτροπή' sorts before 'Επιτροπή Ποιότητας Ζωής', so the
        // member of both is placed by their 5 there, not by their 1 in the other.
        expect(names(sortPartyMembers(people, PARTY))).toEqual(['one-committee', 'two-committees']);
        // The party list and the city list read the same seat.
        expect(names(sortPeople(people))).toEqual(['one-committee', 'two-committees']);
    });

    it('ignores a head role that has ended or belongs to another party', () => {
        const people = [
            person('member', 'Άννα Άλφα', [partyRole(PARTY), seat(COUNCIL, 1)]),
            person('former-head', 'Βασίλης Βήτα', [partyRole(PARTY, true, ENDED), partyRole(PARTY), seat(COUNCIL, 2)]),
            person('other-head', 'Γιάννης Γάμμα', [partyRole('other', true), partyRole(PARTY), seat(COUNCIL, 3)]),
        ];
        expect(names(sortPartyMembers(people, PARTY))).toEqual(['member', 'former-head', 'other-head']);
    });
});

describe('sortPeople', () => {
    it('lists the mayor, then each body in its order, then everyone else by surname, each person once', () => {
        const people = [
            person('unplaced', 'Ζήσης Ωμέγα', [partyRole('party')]),
            person('community-member', 'Άννα Άλφα', [seat(COMMUNITY, 1)]),
            person('committee-only', 'Βασίλης Βήτα', [seat(COMMITTEE, 2)]),
            person('committee-chair', 'Γιάννης Γάμμα', [seat(COMMITTEE, 5, { isHead: true })]),
            person('council-2', 'Δήμητρα Δέλτα', [seat(COUNCIL, 2), seat(COMMITTEE, 1)]),
            person('council-1', 'Ελένη Έψιλον', [seat(COUNCIL, 1)]),
            person('mayor', 'Μιχάλης Μι', [mayorRole(), seat(COMMITTEE, 3)]),
            person('former', 'Άρης Άλφα', [seat(COUNCIL, 1, ENDED)]),
        ];
        expect(names(sortPeople(people))).toEqual([
            'mayor',
            'council-1', 'council-2',
            'committee-chair', 'committee-only',
            'community-member',
            'former', 'unplaced',
        ]);
    });

    it('with a body type, places people only by the bodies of that type', () => {
        const people = [
            person('council-only', 'Άννα Άλφα', [seat(COUNCIL, 1)]),
            person('both', 'Ζήσης Ωμέγα', [seat(COUNCIL, 2), seat(COMMITTEE, 1)]),
            person('committee-only', 'Βασίλης Βήτα', [seat(COMMITTEE, 2)]),
            person('mayor', 'Μιχάλης Μι', [mayorRole()]),
        ];
        // The councillor on the committee leads it: committee order, not council order.
        expect(names(sortPeople(people, 'committee'))).toEqual(['mayor', 'both', 'committee-only', 'council-only']);
        expect(names(sortPeople(people, 'council'))).toEqual(['mayor', 'council-only', 'both', 'committee-only']);
    });

    it('orders bodies of the same type by name', () => {
        const people = [
            person('b', 'Βασίλης Βήτα', [seat(COMMITTEE_B, 1)]),
            person('a', 'Άννα Άλφα', [seat(COMMITTEE, 1)]),
        ];
        expect(names(sortPeople(people))).toEqual(['a', 'b']);
    });

    it('does not mutate the input', () => {
        const people = [person('b', 'B', [seat(COUNCIL, 2)]), person('a', 'A', [seat(COUNCIL, 1)])];
        sortPeople(people);
        expect(names(people)).toEqual(['b', 'a']);
    });
});
