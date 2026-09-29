import { adaFromDiavgeiaUrl, normalizeAda } from '../ada';

describe('normalizeAda', () => {
    it('keeps a canonical ΑΔΑ', () => expect(normalizeAda('9ΩΡΤΩΞ1-0ΥΣ')).toBe('9ΩΡΤΩΞ1-0ΥΣ'));
    it('trims and uppercases Greek', () => expect(normalizeAda('  9ωρτωξ1-0υσ ')).toBe('9ΩΡΤΩΞ1-0ΥΣ'));
    it('maps Latin look-alikes to Greek', () => expect(normalizeAda('9ΩPTΩΞ1-0YΣ')).toBe('9ΩΡΤΩΞ1-0ΥΣ'));
    it('rejects a malformed value', () => {
        expect(normalizeAda('')).toBeNull();
        expect(normalizeAda('hello')).toBeNull();
        expect(normalizeAda('9ΩΡΤΩΞ1')).toBeNull();
    });
});

describe('adaFromDiavgeiaUrl', () => {
    it('reads the ΑΔΑ from a document or a view link', () => {
        expect(adaFromDiavgeiaUrl('https://diavgeia.gov.gr/doc/9ΩΡΤΩΞ1-0ΥΣ')).toBe('9ΩΡΤΩΞ1-0ΥΣ');
        expect(adaFromDiavgeiaUrl('https://diavgeia.gov.gr/decision/view/9%CE%A9%CE%A1%CE%A4%CE%A9%CE%9E1-0%CE%A5%CE%A3')).toBe('9ΩΡΤΩΞ1-0ΥΣ');
    });
    it('returns null for any other URL', () => {
        expect(adaFromDiavgeiaUrl('https://files.example/decision.pdf')).toBeNull();
        expect(adaFromDiavgeiaUrl('not a url')).toBeNull();
    });
    it('returns null for a malformed escape or a look-alike host', () => {
        expect(adaFromDiavgeiaUrl('https://diavgeia.gov.gr/doc/%')).toBeNull();
        expect(adaFromDiavgeiaUrl('https://attacker-diavgeia.gov.gr/doc/9ΩΡΤΩΞ1-0ΥΣ')).toBeNull();
    });
});
