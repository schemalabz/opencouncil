import { inlinePdfUrl } from '../pdfUrl';

describe('inlinePdfUrl', () => {
    it('appends inline=true to diavgeia document URLs', () => {
        expect(inlinePdfUrl('https://diavgeia.gov.gr/doc/ΨΚΖ7ΩΗ5-ΑΡΚ'))
            .toBe('https://diavgeia.gov.gr/doc/ΨΚΖ7ΩΗ5-ΑΡΚ?inline=true');
    });

    it('uses & when a query already exists', () => {
        expect(inlinePdfUrl('https://diavgeia.gov.gr/doc/X?y=1'))
            .toBe('https://diavgeia.gov.gr/doc/X?y=1&inline=true');
    });

    it('leaves non-diavgeia URLs unchanged', () => {
        expect(inlinePdfUrl('https://example.com/a.pdf')).toBe('https://example.com/a.pdf');
    });
});
