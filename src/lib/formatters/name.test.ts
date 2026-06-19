import { getInitials, getShortName } from './name';

describe('getShortName', () => {
    it('abbreviates a first name to its initial', () => {
        expect(getShortName('Ιωάννης Μώραλης')).toBe('Ι. Μώραλης');
    });

    it('keeps middle parts in the surname tail', () => {
        expect(getShortName('Έφη Μαρία Σπυροπούλου')).toBe('Έ. Μαρία Σπυροπούλου');
    });

    it('returns single-word names unchanged', () => {
        expect(getShortName('Μώραλης')).toBe('Μώραλης');
    });

    it('collapses surrounding and inner whitespace', () => {
        expect(getShortName('  Ιωάννης   Μώραλης  ')).toBe('Ι. Μώραλης');
    });

    it('returns an empty string for empty input', () => {
        expect(getShortName('')).toBe('');
    });
});

describe('getInitials', () => {
    it('uses the first and last name parts', () => {
        expect(getInitials('Ιωάννης Μώραλης')).toBe('ΙΜ');
    });

    it('skips middle parts', () => {
        expect(getInitials('Έφη Μαρία Σπυροπούλου')).toBe('ΈΣ');
    });

    it('falls back to the first two characters for single-word names', () => {
        // toUpperCase() preserves the Greek tonos, matching the prior behavior.
        expect(getInitials('Μώραλης')).toBe('ΜΏ');
    });

    it('returns an empty string for empty input', () => {
        expect(getInitials('   ')).toBe('');
    });
});
