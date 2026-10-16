import { withCanonicalUrl } from '../hreflang';
import { siteOpenGraph } from '@/lib/og/siteOpenGraph';

let currentHost: string;

jest.mock('next/headers', () => ({
    headers: async () => new Headers({ host: currentHost }),
    // getRealm() also consults the realm-override cookie; no override here.
    cookies: async () => ({ get: () => undefined }),
}));

describe('withCanonicalUrl', () => {
    it('canonicalizes to the unprefixed greece URL on the .gr host', async () => {
        currentHost = 'opencouncil.gr';
        expect((await withCanonicalUrl('/athens', {})).alternates).toEqual({
            canonical: 'https://opencouncil.gr/athens',
        });
    });

    it('canonicalizes to the .fr base URL on the french host', async () => {
        currentHost = 'opencouncil.fr';
        expect((await withCanonicalUrl('/lyon', {})).alternates).toEqual({
            canonical: 'https://opencouncil.fr/lyon',
        });
    });

    it('returns the bare base URL for the homepage', async () => {
        currentHost = 'opencouncil.gr';
        expect((await withCanonicalUrl('', {})).alternates).toEqual({
            canonical: 'https://opencouncil.gr',
        });
    });

    it('defaults unknown hosts to the greece realm', async () => {
        currentHost = 'localhost:3000';
        expect((await withCanonicalUrl('/athens', {})).alternates).toEqual({
            canonical: 'https://opencouncil.gr/athens',
        });
    });

    it('resolves realm subdomains to their realm', async () => {
        currentHost = 'www.opencouncil.fr';
        expect((await withCanonicalUrl('/x', {})).alternates).toEqual({
            canonical: 'https://opencouncil.fr/x',
        });
    });

    // A preview must never canonicalize to itself — the whole point of the
    // canonical is to point crawlers at the production page.
    it('canonicalizes a preview host to the production apex', async () => {
        currentHost = 'pr-7.opencouncil.dev';
        expect((await withCanonicalUrl('/x', {})).alternates).toEqual({
            canonical: 'https://opencouncil.gr/x',
        });
    });

    it('states the canonical URL as og:url on the page\'s own card', async () => {
        currentHost = 'opencouncil.gr';
        const metadata = await withCanonicalUrl('/zografou/notifications', { openGraph: { title: 'Νότης' } });
        expect(metadata.openGraph).toEqual({ url: 'https://opencouncil.gr/zografou/notifications', title: 'Νότης' });
    });

    it('gives a page without a card the site-wide one with its own og:url', async () => {
        currentHost = 'opencouncil.gr';
        const metadata = await withCanonicalUrl('/privacy', { title: 'Privacy' });
        expect(metadata.title).toBe('Privacy');
        expect(metadata.openGraph).toEqual({ ...siteOpenGraph, url: 'https://opencouncil.gr/privacy' });
    });

    it('keeps an og:url that the page sets itself', async () => {
        currentHost = 'opencouncil.gr';
        const metadata = await withCanonicalUrl('/x', { openGraph: { url: 'https://opencouncil.gr/x?excerpt=1' } });
        expect(metadata.openGraph?.url).toBe('https://opencouncil.gr/x?excerpt=1');
        expect(metadata.alternates?.canonical).toBe('https://opencouncil.gr/x');
    });
});
