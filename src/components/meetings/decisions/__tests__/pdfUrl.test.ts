import { diavgeiaSearchUrl, inlinePdfUrl } from '@/components/meetings/decisions/pdfUrl';

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

describe('diavgeiaSearchUrl', () => {
    it('filters by organization through the query and by unit and signer through fq', () => {
        const url = new URL(diavgeiaSearchUrl('6013', { unit: '84655', signer: '100022189' }));
        expect(url.origin + url.pathname).toBe('https://diavgeia.gov.gr/search');
        expect(url.searchParams.get('advanced')).toBe('true');
        expect(url.searchParams.get('query')).toBe('organizationUid:"6013"');
        expect(url.searchParams.getAll('fq')).toEqual(['unitUid:"84655"', 'signerUid:"100022189"']);
    });

    it('a unit without a signer carries one fq filter, an organization alone none', () => {
        expect(new URL(diavgeiaSearchUrl('6013', { unit: '78341' })).searchParams.getAll('fq')).toEqual(['unitUid:"78341"']);
        expect(new URL(diavgeiaSearchUrl('6013')).searchParams.getAll('fq')).toEqual([]);
    });
});
