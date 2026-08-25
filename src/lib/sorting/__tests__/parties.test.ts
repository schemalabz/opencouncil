import { sortParties } from '../parties';
import type { PartyWithPersons } from '@/lib/db/parties';

type PartyFixture = {
    id: string;
    name: string;
    people: { id: string; roles: { partyId: string; isHead: boolean }[] }[];
};

/** Only the fields sortParties reads — the full Prisma shape is irrelevant here. */
function party(id: string, name: string, memberCount: number, headIndex: number | null = null): PartyFixture {
    return {
        id,
        name,
        people: Array.from({ length: memberCount }, (_, i) => ({
            id: `${id}-p${i}`,
            roles: [{ partyId: id, isHead: i === headIndex }],
        })),
    };
}

const sort = (parties: PartyFixture[]) =>
    sortParties(parties as unknown as PartyWithPersons[]).map(p => p.id);

describe('sortParties', () => {
    it('puts the largest party first', () => {
        expect(sort([party('b', 'Beta', 4), party('a', 'Alpha', 29), party('c', 'Gamma', 9)]))
            .toEqual(['a', 'c', 'b']);
    });

    it('breaks a tie on member count by which party has a head', () => {
        expect(sort([party('nohead', 'Alpha', 5), party('head', 'Zeta', 5, 0)]))
            .toEqual(['head', 'nohead']);
    });

    it('falls back to alphabetical order when both are tied', () => {
        expect(sort([party('z', 'Ωμέγα', 5, 0), party('a', 'Άλφα', 5, 0)]))
            .toEqual(['a', 'z']);
    });

    it('ignores a head role that belongs to another party', () => {
        const foreignHead: PartyFixture = {
            id: 'foreign',
            name: 'Alpha',
            people: [{ id: 'x', roles: [{ partyId: 'somewhere-else', isHead: true }] }],
        };
        expect(sort([foreignHead, party('own', 'Zeta', 1, 0)])).toEqual(['own', 'foreign']);
    });

    it('does not mutate the input', () => {
        const input = [party('b', 'Beta', 1), party('a', 'Alpha', 9)];
        sort(input);
        expect(input.map(p => p.id)).toEqual(['b', 'a']);
    });
});
