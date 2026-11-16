import { toScript } from '@/lib/serbian';
import { displayMatchRange } from '../findReplace';

const latn = (t: string) => toScript(t, 'latn');
const cyrl = (t: string) => toScript(t, 'cyrl');
const marked = (stored: string, start: number, end: number, localize: (t: string) => string) => {
    const [s, e] = displayMatchRange(stored, start, end, localize);
    return localize(stored).slice(s, e);
};

describe('displayMatchRange', () => {
    it('maps offsets one to one when the text does not change', () => {
        expect(marked('foo bar', 4, 7, t => t)).toBe('bar');
    });

    it('keeps the case of a Cyrillic digraph that depends on the next letter', () => {
        expect(marked('ЉУБЉАНА', 1, 3, latn)).toBe('UB');
        expect(marked('ЉУБЉАНА', 2, 4, latn)).toBe('BLJ');
    });

    it('maps offsets after earlier digraphs in the text', () => {
        expect(marked('Љубљана и Њива', 10, 14, latn)).toBe('Njiva');
    });

    it('marks the whole Cyrillic letter when the match splits a Latin digraph', () => {
        expect(marked('njiva', 1, 2, cyrl)).toBe('њ');
        expect(marked('njiva', 1, 5, cyrl)).toBe('њива');
        expect(marked('njiva', 0, 1, cyrl)).toBe('њ');
    });

    it('maps a word that stays in Latin one to one', () => {
        expect(marked('njx', 2, 3, cyrl)).toBe('x');
    });

    it('maps an exception word whose nj stays two letters one to one', () => {
        expect(marked('injekcija', 2, 3, cyrl)).toBe(cyrl('injekcija').slice(2, 3));
    });

    it('maps offsets in later words after a converted digraph word', () => {
        expect(marked('njiva polje', 6, 11, cyrl)).toBe('поље');
    });
});
