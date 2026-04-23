/** @jest-environment node */
jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/db/users', () => ({
    updateUserProfile: jest.fn(),
    deleteCurrentUser: jest.fn(),
}));

jest.mock('@/lib/discord', () => ({
    sendUserOnboardedAdminAlert: jest.fn(),
}));

import { DELETE } from '../route';
import { getCurrentUser } from '@/lib/auth';
import { deleteCurrentUser } from '@/lib/db/users';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockDeleteCurrentUser = deleteCurrentUser as jest.MockedFunction<typeof deleteCurrentUser>;

describe('DELETE /api/profile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('returns 401 when there is no authenticated user', async () => {
        mockGetCurrentUser.mockResolvedValue(null as any);
        const res = await DELETE();
        expect(res.status).toBe(401);
        expect(mockDeleteCurrentUser).not.toHaveBeenCalled();
    });

    it('returns 204 and calls deleteCurrentUser on success', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1' } as any);
        mockDeleteCurrentUser.mockResolvedValue(undefined);

        const res = await DELETE();
        expect(res.status).toBe(204);
        expect(mockDeleteCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when deleteCurrentUser throws', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1' } as any);
        mockDeleteCurrentUser.mockRejectedValue(new Error('db down'));

        const res = await DELETE();
        expect(res.status).toBe(500);
    });
});
