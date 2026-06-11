import { parseReferences, stripReferences } from '../references';

describe('stripReferences', () => {
    it('replaces utterance reference links with their display text', () => {
        const text =
            'Οι δικηγόροι υποστήριξαν ότι [υπάρχει μόνο ένα email μιας κατοίκου](REF:UTTERANCE:cmp48c0sb0u4jz3nxj77grhes) και ότι [10 μόνιμοι εργαζόμενοι θα επηρεαστούν](REF:UTTERANCE:cmp48c0sc0u5yz3nxorxjyloj).';
        expect(stripReferences(text)).toBe(
            'Οι δικηγόροι υποστήριξαν ότι υπάρχει μόνο ένα email μιας κατοίκου και ότι 10 μόνιμοι εργαζόμενοι θα επηρεαστούν.',
        );
    });

    it('handles all reference types', () => {
        expect(stripReferences('[α](REF:PERSON:p1) [β](REF:PARTY:p2) [γ](REF:SUBJECT:s1)')).toBe('α β γ');
    });

    it('leaves regular markdown links and plain text untouched', () => {
        const text = 'Δες [εδώ](https://example.com) για λεπτομέρειες.';
        expect(stripReferences(text)).toBe(text);
    });

    it('agrees with parseReferences on the link grammar', () => {
        const text = '[κείμενο](REF:UTTERANCE:abc123)';
        expect(parseReferences(text)).toHaveLength(1);
        expect(stripReferences(text)).toBe('κείμενο');
    });
});
