/** @jest-environment node */
jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn(),
}));

import { GET } from '@/app/api/route';
import { getCurrentUser } from '@/lib/auth';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;

type Spec = { openapi: string; paths: Record<string, Record<string, { 'x-access-level'?: string }>> };

async function specFor(user: Awaited<ReturnType<typeof getCurrentUser>>): Promise<Spec> {
    mockGetCurrentUser.mockResolvedValue(user);
    return (await GET()).json();
}

const accessLevels = (spec: Spec) =>
    new Set(Object.values(spec.paths).flatMap(item => Object.values(item).map(op => op['x-access-level'] ?? 'public')));

describe('GET /api', () => {
    it('serves an OpenAPI 3.1 document with the public operations to an anonymous reader', async () => {
        const spec = await specFor(null);

        expect(spec.openapi).toBe('3.1.0');
        expect(spec.paths['/api/search']?.post).toBeDefined();
        expect([...accessLevels(spec)]).toEqual(['public']);
    });

    it('adds the superadmin operations for a superadmin', async () => {
        const spec = await specFor({ isSuperAdmin: true, administers: [] } as unknown as Awaited<ReturnType<typeof getCurrentUser>>);

        expect(spec.paths['/api/cities/{cityId}/populate']?.post).toBeDefined();
        expect(accessLevels(spec)).toContain('superadmin');
    });
});
