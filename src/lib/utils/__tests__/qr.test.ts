jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

import { isExternalUrl, appendUtmParams } from '../qr';

describe('isExternalUrl', () => {
    it('returns true for https URLs', () => {
        expect(isExternalUrl('https://example.com')).toBe(true);
    });

    it('returns true for http URLs', () => {
        expect(isExternalUrl('http://example.com')).toBe(true);
    });

    it('returns false for relative URLs', () => {
        expect(isExternalUrl('/chalandri')).toBe(false);
    });
});

describe('appendUtmParams', () => {
    const noParams = new URLSearchParams();

    describe('defaults (backward compatibility)', () => {
        it('applies default UTM params for relative URL with no incoming params', () => {
            const result = appendUtmParams('/chalandri', 'keyring', noParams);
            const url = new URL(result);

            expect(url.origin).toBe('https://opencouncil.gr');
            expect(url.pathname).toBe('/chalandri');
            expect(url.searchParams.get('utm_source')).toBe('qr');
            expect(url.searchParams.get('utm_medium')).toBe('offline');
            expect(url.searchParams.get('utm_campaign')).toBe('keyring');
        });

        it('applies default UTM params for external URL with no incoming params', () => {
            const result = appendUtmParams('https://example.com/page', 'keyring', noParams);
            const url = new URL(result);

            expect(url.origin).toBe('https://example.com');
            expect(url.pathname).toBe('/page');
            expect(url.searchParams.get('utm_source')).toBe('qr');
            expect(url.searchParams.get('utm_medium')).toBe('offline');
            expect(url.searchParams.get('utm_campaign')).toBe('keyring');
        });
    });

    describe('incoming param forwarding', () => {
        it('forwards utm_content from incoming params', () => {
            const incoming = new URLSearchParams({ utm_content: '01' });
            const result = appendUtmParams('/chalandri', 'keyring', incoming);
            const url = new URL(result);

            expect(url.searchParams.get('utm_content')).toBe('01');
            expect(url.searchParams.get('utm_source')).toBe('qr');
            expect(url.searchParams.get('utm_medium')).toBe('offline');
            expect(url.searchParams.get('utm_campaign')).toBe('keyring');
        });

        it('forwards arbitrary non-UTM params', () => {
            const incoming = new URLSearchParams({ ref: 'poster-a3' });
            const result = appendUtmParams('/chalandri', 'keyring', incoming);
            const url = new URL(result);

            expect(url.searchParams.get('ref')).toBe('poster-a3');
        });
    });

    describe('incoming params override defaults', () => {
        it('incoming utm_medium=poster overrides default offline', () => {
            const incoming = new URLSearchParams({ utm_medium: 'poster' });
            const result = appendUtmParams('/chalandri', 'keyring', incoming);
            const url = new URL(result);

            expect(url.searchParams.get('utm_medium')).toBe('poster');
        });

        it('incoming utm_source overrides default', () => {
            const incoming = new URLSearchParams({ utm_source: 'custom' });
            const result = appendUtmParams('/chalandri', 'keyring', incoming);
            const url = new URL(result);

            expect(url.searchParams.get('utm_source')).toBe('custom');
        });
    });

    describe('destination URL params are never overwritten', () => {
        it('preserves utm_source already on destination URL', () => {
            const incoming = new URLSearchParams({ utm_source: 'incoming' });
            const result = appendUtmParams('/chalandri?utm_source=original', 'keyring', incoming);
            const url = new URL(result);

            expect(url.searchParams.get('utm_source')).toBe('original');
        });

        it('preserves all existing destination params over both incoming and defaults', () => {
            const incoming = new URLSearchParams({
                utm_source: 'incoming',
                utm_medium: 'incoming',
                utm_campaign: 'incoming',
            });
            const result = appendUtmParams(
                '/chalandri?utm_source=dest&utm_medium=dest&utm_campaign=dest',
                'keyring',
                incoming,
            );
            const url = new URL(result);

            expect(url.searchParams.get('utm_source')).toBe('dest');
            expect(url.searchParams.get('utm_medium')).toBe('dest');
            expect(url.searchParams.get('utm_campaign')).toBe('dest');
        });
    });

    describe('full per-poster flow', () => {
        it('produces correct URL for poster toolkit usage', () => {
            const incoming = new URLSearchParams({
                utm_source: 'qr',
                utm_medium: 'poster',
                utm_campaign: 'zografou25',
                utm_content: '01',
            });
            const result = appendUtmParams('/el/zografou', 'zografou25', incoming);
            const url = new URL(result);

            expect(url.origin).toBe('https://opencouncil.gr');
            expect(url.pathname).toBe('/el/zografou');
            expect(url.searchParams.get('utm_source')).toBe('qr');
            expect(url.searchParams.get('utm_medium')).toBe('poster');
            expect(url.searchParams.get('utm_campaign')).toBe('zografou25');
            expect(url.searchParams.get('utm_content')).toBe('01');
        });
    });

    describe('error handling', () => {
        it('treats non-URL strings as relative paths (resolved against base)', () => {
            const result = appendUtmParams('not-a-url', 'code', noParams);
            const url = new URL(result);

            expect(url.pathname).toBe('/not-a-url');
            expect(url.searchParams.get('utm_campaign')).toBe('code');
        });
    });
});
