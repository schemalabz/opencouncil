jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn(),
}));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';
import { auth } from '@/auth';

const get = (path: string, host = 'opencouncil.gr') =>
    proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }));

beforeEach(() => {
    jest.mocked(auth).mockClear();
});

/**
 * A path that is not a page of the app gets a 404 from the proxy. Next
 * renders nested segments in parallel, so a 404 from a layout arrives after
 * the pages below it have run their queries.
 */
describe('proxy on a path with a dot', () => {
    it.each(['/.env', '/config/initializers/stripe.rb', '/athens/terraform.tfvars', '/en/.env', '/about/.env'])(
        'answers 404 for %s and does no other work',
        async (path) => {
            const res = await get(path);

            expect(res!.status).toBe(404);
            expect(auth).not.toHaveBeenCalled();
        },
    );

    it.each(['/favicon.ico', '/robots.txt', '/icons/icon-192.png', '/youtu.be/dQw4w9WgXcQ'])(
        'hands %s to Next with no page handling',
        async (path) => {
            const res = await get(path);

            expect(res!.headers.get('x-middleware-next')).toBe('1');
            expect(auth).not.toHaveBeenCalled();
        },
    );
});
