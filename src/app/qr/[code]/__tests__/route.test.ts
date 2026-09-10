/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'https://opencouncil.gr' } }));

const mockFindUnique = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { qrCampaign: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

import { NextRequest } from 'next/server';
import { GET } from '../route';

/** A scan that arrived on `origin` — the realm domain printed on the poster. */
const scan = (origin: string, path = '/qr/abc') => new NextRequest(new URL(path, origin));
const params = (code: string) => ({ params: Promise.resolve({ code }) });

beforeEach(() => {
    mockFindUnique.mockReset();
});

describe('GET /qr/[code]', () => {
    it('sends an unknown code home relatively, so the scan stays on the realm it arrived on', async () => {
        mockFindUnique.mockResolvedValue(null);
        const res = await GET(scan('https://opencouncil.cy'), params('nope'));
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/');
    });

    it('sends an inactive campaign home the same way', async () => {
        mockFindUnique.mockResolvedValue({ url: 'https://example.test', isActive: false });
        const res = await GET(scan('https://opencouncil.rs'), params('paused'));
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/');
    });

    it('does not force the Greek locale on the fallback', async () => {
        mockFindUnique.mockResolvedValue(null);
        const res = await GET(scan('https://opencouncil.fr'), params('nope'));
        expect(res.headers.get('location')).not.toMatch(/^\/[a-z]{2}(\/|$)/);
    });

    it('still redirects an active campaign to its destination with the utm defaults', async () => {
        mockFindUnique.mockResolvedValue({ url: 'https://example.test/landing', isActive: true });
        const res = await GET(scan('https://opencouncil.gr', '/qr/abc?utm_content=poster7'), params('abc'));
        expect(res.status).toBe(307);
        const to = new URL(res.headers.get('location') as string);
        expect(to.origin + to.pathname).toBe('https://example.test/landing');
        expect(to.searchParams.get('utm_content')).toBe('poster7');
        expect(to.searchParams.get('utm_campaign')).toBe('abc');
    });
});
