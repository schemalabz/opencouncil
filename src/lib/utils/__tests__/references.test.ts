import { parseReferences } from '../references';
import { stripMarkdown } from '@/lib/formatters/markdown';

// The landing flattens subject descriptions with stripMarkdown (which also handles the
// REF:TYPE:ID link grammar), so these cover that plus the rest of the markdown it strips.
describe('stripMarkdown', () => {
    it('replaces utterance reference links with their display text', () => {
        const text =
            'Οι δικηγόροι υποστήριξαν ότι [υπάρχει μόνο ένα email μιας κατοίκου](REF:UTTERANCE:cmp48c0sb0u4jz3nxj77grhes) και ότι [10 μόνιμοι εργαζόμενοι θα επηρεαστούν](REF:UTTERANCE:cmp48c0sc0u5yz3nxorxjyloj).';
        expect(stripMarkdown(text)).toBe(
            'Οι δικηγόροι υποστήριξαν ότι υπάρχει μόνο ένα email μιας κατοίκου και ότι 10 μόνιμοι εργαζόμενοι θα επηρεαστούν.',
        );
    });

    it('handles all reference types', () => {
        expect(stripMarkdown('[α](REF:PERSON:p1) [β](REF:PARTY:p2) [γ](REF:SUBJECT:s1)')).toBe('α β γ');
    });

    it('strips regular markdown links too, keeping the text', () => {
        expect(stripMarkdown('Δες [εδώ](https://example.com) για λεπτομέρειες.')).toBe('Δες εδώ για λεπτομέρειες.');
    });

    it('strips bold, italic and inline code', () => {
        expect(stripMarkdown('**bold** and _italic_ and `code`')).toBe('bold and italic and code');
    });

    it('agrees with parseReferences on the link grammar', () => {
        const text = '[κείμενο](REF:UTTERANCE:abc123)';
        expect(parseReferences(text)).toHaveLength(1);
        expect(stripMarkdown(text)).toBe('κείμενο');
    });
});
