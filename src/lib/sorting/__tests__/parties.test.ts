import { sortParties } from '../parties';
import type { PartyWithPersons } from '@/lib/db/parties';

type Role = {
    partyId: string;
    isHead: boolean;
    startDate: Date | null;
    endDate: Date | null;
    administrativeBody: { type: string } | null;
};

type PartyFixture = {
    id: string;
    name: string;
    name_en?: string;
    people: { id: string; roles: Role[] }[];
};

const OPEN = { startDate: null, endDate: null };
const COUNCIL = { type: 'council' };

/** Only the fields sortParties reads — the full Prisma shape is irrelevant here. */
function party(id: string, name: string, seats: number, headIndex: number | null = null): PartyFixture {
    return {
        id,
        name,
        people: Array.from({ length: seats }, (_, i) => ({
            id: `${id}-p${i}`,
            roles: [{ partyId: id, isHead: i === headIndex, ...OPEN, administrativeBody: COUNCIL }],
        })),
    };
}

/** A party whose councillors have resigned: people on the books, no seat held. */
function partyWithoutSeats(id: string, name: string, memberCount: number): PartyFixture {
    return {
        id,
        name,
        people: Array.from({ length: memberCount }, (_, i) => ({
            id: `${id}-p${i}`,
            roles: [{ partyId: id, isHead: false, ...OPEN, administrativeBody: null }],
        })),
    };
}

const sort = (parties: PartyFixture[], locale?: string) =>
    sortParties(parties as unknown as PartyWithPersons[], locale).map(p => p.id);

describe('sortParties', () => {
    it('puts the largest party first', () => {
        expect(sort([party('b', 'Beta', 4), party('a', 'Alpha', 29), party('c', 'Gamma', 9)]))
            .toEqual(['a', 'c', 'b']);
    });

    it('sorts a party that holds no council seat below every party that does', () => {
        // Ελεύθεροι Αθηναίοι: five people still on the books, every council seat
        // resigned. Ranking it on the roster put it third in a list led by 26.
        expect(sort([
            party('small', 'Beta', 1),
            partyWithoutSeats('resigned', 'Alpha', 5),
            party('big', 'Gamma', 26),
        ])).toEqual(['big', 'small', 'resigned']);
    });

    it('breaks a tie on seat count by which party has a head', () => {
        expect(sort([party('nohead', 'Alpha', 5), party('head', 'Zeta', 5, 0)]))
            .toEqual(['head', 'nohead']);
    });

    it('falls back to alphabetical order when both are tied', () => {
        expect(sort([party('z', 'Ωμέγα', 5, 0), party('a', 'Άλφα', 5, 0)]))
            .toEqual(['a', 'z']);
    });

    it('breaks the tie on the name the card prints, not the stored Greek one', () => {
        // Two parties tied on seats and on having a head. Under /en the card
        // renders name_en, so ordering by `name` sorted them by a string the
        // reader never sees.
        const vrilissia = { ...party('v', 'Βριλήσσια: Πορεία Ευθύνης', 3, 0), name_en: 'Vrilissia: Poreia Efthynis' };
        const drasi = { ...party('d', 'Δράση για μια Άλλη Πόλη', 3, 0), name_en: 'Drasi gia mia Alli Poli' };
        expect(sort([vrilissia, drasi], 'el')).toEqual(['v', 'd']);
        expect(sort([vrilissia, drasi], 'en')).toEqual(['d', 'v']);
    });

    it('ignores a head role that belongs to another party', () => {
        const foreignHead: PartyFixture = {
            id: 'foreign',
            name: 'Alpha',
            people: [{ id: 'x', roles: [{ partyId: 'somewhere-else', isHead: true, ...OPEN, administrativeBody: COUNCIL }] }],
        };
        expect(sort([foreignHead, party('own', 'Zeta', 1, 0)])).toEqual(['own', 'foreign']);
    });

    it('does not mutate the input', () => {
        const input = [party('b', 'Beta', 1), party('a', 'Alpha', 9)];
        sort(input);
        expect(input.map(p => p.id)).toEqual(['b', 'a']);
    });
});
