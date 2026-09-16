/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: { NEXT_PUBLIC_BUILD_COMMIT_SHA: undefined as string | undefined },
}));

import { GET } from '../route';
import { env } from '@/env.mjs';

const mutableEnv = env as { NEXT_PUBLIC_BUILD_COMMIT_SHA: string | undefined };

const originalHostname = process.env.HOSTNAME;

describe('GET /api/health', () => {
    beforeEach(() => {
        mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = undefined;
        // The platform sets this. A test must not depend on the machine it runs on.
        process.env.HOSTNAME = 'opencouncil-7d9f4c8b6d-xyz12';
    });

    afterAll(() => {
        if (originalHostname === undefined) delete process.env.HOSTNAME;
        else process.env.HOSTNAME = originalHostname;
    });

    it('publishes the commit the build carries', async () => {
        mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = 'ff8e6c270c02d02c8a2b9830cf53eee2e4cab935';

        const body = await GET().json();

        expect(body).toMatchObject({
            service: 'opencouncil',
            commit: 'ff8e6c270c02d02c8a2b9830cf53eee2e4cab935',
        });
    });

    it('reports a null commit when the variable is absent', async () => {
        const body = await GET().json();

        expect(body.commit).toBeNull();
    });

    // A deployment that sets the variable to nothing passes zod, because the
    // schema is `z.string().optional()` and t3-env does not map an empty string
    // to undefined. An empty commit must read as absent, not as a commit.
    it('reports a null commit when the variable is empty', async () => {
        mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = '';

        const body = await GET().json();

        expect(body.commit).toBeNull();
    });

    // The service autoscales, so a caller tells two instances apart by this
    // value. The raw hostname would also publish the internal naming.
    it('names the instance without publishing the hostname', async () => {
        const body = await GET().json();

        expect(body.instance).toMatch(/^[0-9a-f]{8}$/);
        expect(JSON.stringify(body)).not.toContain('opencouncil-7d9f4c8b6d-xyz12');
    });

    it('reports a null instance when the platform sets no hostname', async () => {
        delete process.env.HOSTNAME;

        const body = await GET().json();

        expect(body.instance).toBeNull();
    });

    // The route must not reach a backend. That is what keeps it fast and stops
    // it reporting the state of anything but itself.
    it('reports identity only', async () => {
        const body = await GET().json();

        expect(Object.keys(body).sort()).toEqual(['commit', 'instance', 'service']);
    });

    // Cloudflare sits in front of production and rewrites this header, so the
    // assertion covers the origin only.
    it('forbids caching at the origin', () => {
        expect(GET().headers.get('Cache-Control')).toBe('no-store');
    });
});
