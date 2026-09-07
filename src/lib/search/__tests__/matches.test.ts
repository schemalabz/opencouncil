import { splitMatches } from '../matches';
import { MATCH_START, MATCH_END } from '../constants';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { toScript } from '@/lib/serbian';

const mark = (s: string) => `${MATCH_START}${s}${MATCH_END}`;

describe('splitMatches', () => {
    it('returns unmarked text as a single unmatched segment', () => {
        expect(splitMatches('Έγκριση προϋπολογισμού')).toEqual([
            { text: 'Έγκριση προϋπολογισμού', matched: false },
        ]);
    });

    it('splits a marked span out of the surrounding text', () => {
        expect(splitMatches(`Αίτηση για ${mark('Αδειοδότηση')} καταστήματος`)).toEqual([
            { text: 'Αίτηση για ', matched: false },
            { text: 'Αδειοδότηση', matched: true },
            { text: ' καταστήματος', matched: false },
        ]);
    });

    it('handles multiple and adjacent spans', () => {
        expect(splitMatches(`${mark('Άδεια')}${mark('δότηση')} τέλος`)).toEqual([
            { text: 'Άδεια', matched: true },
            { text: 'δότηση', matched: true },
            { text: ' τέλος', matched: false },
        ]);
    });

    it('handles a span at the very start and at the very end', () => {
        expect(splitMatches(`${mark('αρχή')} μέση ${mark('τέλος')}`)).toEqual([
            { text: 'αρχή', matched: true },
            { text: ' μέση ', matched: false },
            { text: 'τέλος', matched: true },
        ]);
    });

    it('drops empty runs rather than emitting empty segments', () => {
        expect(splitMatches(`${mark('')}κείμενο`)).toEqual([
            { text: 'κείμενο', matched: false },
        ]);
    });
});

// The markers are private-use code points precisely so they survive every
// transform a fragment passes through on its way to the screen. If one of
// these fails, the marker choice in ./constants is wrong, not the transform.
describe('markers survive the transforms applied to a fragment', () => {
    const fragment = `Η **${mark('άδεια')}** και [ο ${mark('κανονισμός')}](https://x.gr)`;

    it('survive stripMarkdown', () => {
        const stripped = stripMarkdown(fragment);
        expect(stripped).toContain(MATCH_START);
        expect(stripped).toContain(MATCH_END);
        expect(splitMatches(stripped).filter(s => s.matched).map(s => s.text))
            .toEqual(['άδεια', 'κανονισμός']);
    });

    it('survive Serbian transliteration in both directions', () => {
        for (const script of ['cyrl', 'latn'] as const) {
            const converted = toScript(`Odluka o ${mark('budžetu')}`, script);
            expect(converted).toContain(MATCH_START);
            expect(splitMatches(converted).filter(s => s.matched)).toHaveLength(1);
        }
    });
});
