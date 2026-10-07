/** @jest-environment node */
jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/db/users', () => ({
    updateUserProfile: jest.fn(),
    deleteCurrentUser: jest.fn(),
    phoneBelongsToAnotherUser: jest.fn().mockResolvedValue(false),
}));

jest.mock('@/lib/discord', () => ({
    sendUserOnboardedAdminAlert: jest.fn(),
}));

import { DELETE, POST } from '../route';
import { getCurrentUser } from '@/lib/auth';
import { deleteCurrentUser, updateUserProfile } from '@/lib/db/users';
import { sendUserOnboardedAdminAlert } from '@/lib/discord';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockDeleteCurrentUser = deleteCurrentUser as jest.MockedFunction<typeof deleteCurrentUser>;
const mockUpdateUserProfile = updateUserProfile as jest.MockedFunction<typeof updateUserProfile>;
const mockAlert = sendUserOnboardedAdminAlert as jest.MockedFunction<typeof sendUserOnboardedAdminAlert>;

describe('POST /api/profile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const post = (body: object) =>
        POST(new Request('http://localhost/api/profile', { method: 'POST', body: JSON.stringify(body) }));

    it('alerts, naming the user, when the save completes onboarding', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', onboarded: false } as Awaited<ReturnType<typeof getCurrentUser>>);
        mockUpdateUserProfile.mockResolvedValue({ id: 'u1' } as Awaited<ReturnType<typeof updateUserProfile>>);
        const res = await post({ name: 'Maria', onboarded: true });

        expect(res.status).toBe(200);
        expect(mockAlert).toHaveBeenCalledWith({ cityName: 'General', onboardingSource: 'profile', signedInUserId: 'u1' });
    });

    it('sends no alert for a save by an onboarded user', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'u1', onboarded: true } as Awaited<ReturnType<typeof getCurrentUser>>);
        mockUpdateUserProfile.mockResolvedValue({ id: 'u1' } as Awaited<ReturnType<typeof updateUserProfile>>);

        const res = await post({ name: 'Maria', onboarded: true });

        expect(res.status).toBe(200);
        expect(mockAlert).not.toHaveBeenCalled();
    });
});

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
