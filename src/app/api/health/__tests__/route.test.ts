/** @jest-environment node */
jest.mock('@/lib/db/health', () => ({
    getDatabaseState: jest.fn(),
}));

jest.mock('@/env.mjs', () => ({
    env: { NEXT_PUBLIC_BUILD_COMMIT_SHA: undefined as string | undefined },
}));

import { GET } from '../route';
import { getDatabaseState } from '@/lib/db/health';
import { env } from '@/env.mjs';

const mockGetDatabaseState = getDatabaseState as jest.MockedFunction<typeof getDatabaseState>;
const mutableEnv = env as { NEXT_PUBLIC_BUILD_COMMIT_SHA: string | undefined };

describe('GET /api/health', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = undefined;
        mockGetDatabaseState.mockResolvedValue({ database: 'ok', migration: 'm1' });
    });

    it('publishes the commit the build carries', async () => {
        mutableEnv.NEXT_PUBLIC_BUILD_COMMIT_SHA = 'ff8e6c270c02d02c8a2b9830cf53eee2e4cab935';

        const body = await (await GET()).json();

        expect(body).toEqual({
            commit: 'ff8e6c270c02d02c8a2b9830cf53eee2e4cab935',
            migration: 'm1',
            database: 'ok',
        });
    });

    it('reports a null commit when the variable is absent', async () => {
        const body = await (await GET()).json();

        expect(body.commit).toBeNull();
    });

    // Cloudflare sits in front of production. A cached answer names a commit
    // that no longer runs, which would end the release poll on the wrong build.
    it('forbids caching', async () => {
        const res = await GET();

        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });

    it('answers 200 when the database is unreachable', async () => {
        mockGetDatabaseState.mockResolvedValue({ database: 'unreachable', migration: null });

        const res = await GET();

        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ database: 'unreachable', migration: null });
    });
});
