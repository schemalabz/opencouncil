/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: { NEXT_PUBLIC_BUILD_COMMIT_SHA: undefined as string | undefined },
}));

import { GET } from '../route';
import { env } from '@/env.mjs';

const mutableEnv = env as { NEXT_PUBLIC_BUILD_COMMIT_SHA: string | undefined };

describe('GET /api/health', () => {
    beforeEach(() => {
        mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = undefined;
    });

    // The exact payload: the route must not reach a backend, so it has nothing
    // else to report.
    it('publishes the service and the commit the build carries', async () => {
        mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = 'ff8e6c270c02d02c8a2b9830cf53eee2e4cab935';

        const body = await GET().json();

        expect(body).toEqual({
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

    // Cloudflare sits in front of production and rewrites this header, so the
    // assertion covers the origin only.
    it('forbids caching at the origin', () => {
        expect(GET().headers.get('Cache-Control')).toBe('no-store');
    });
});
