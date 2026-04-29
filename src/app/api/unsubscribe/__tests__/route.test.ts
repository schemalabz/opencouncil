/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: { NEXTAUTH_SECRET: 'test-secret', NEXTAUTH_URL: 'https://opencouncil.gr' },
}));

jest.mock('@/lib/notifications/tokens', () => ({
    verifyUnsubscribeToken: jest.fn(),
}));

jest.mock('@/lib/db/notifications', () => ({
    disableNotificationPreferenceByCityId: jest.fn(),
    disableAllNotificationPreferences: jest.fn(),
}));

jest.mock('@/lib/db/users', () => ({
    updateUserProfile: jest.fn(),
}));

import { POST } from '../route';
import { verifyUnsubscribeToken } from '@/lib/notifications/tokens';
import {
    disableNotificationPreferenceByCityId,
    disableAllNotificationPreferences,
} from '@/lib/db/notifications';
import { updateUserProfile } from '@/lib/db/users';

const mockVerify = verifyUnsubscribeToken as jest.MockedFunction<typeof verifyUnsubscribeToken>;
const mockDisableCity = disableNotificationPreferenceByCityId as jest.MockedFunction<typeof disableNotificationPreferenceByCityId>;
const mockDisableAll = disableAllNotificationPreferences as jest.MockedFunction<typeof disableAllNotificationPreferences>;
const mockUpdateProfile = updateUserProfile as jest.MockedFunction<typeof updateUserProfile>;

function makeRequest(body: unknown) {
    return { json: async () => body } as Request;
}

describe('POST /api/unsubscribe', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('returns 400 for a malformed JSON body', async () => {
        const badRequest = { json: async () => { throw new SyntaxError('Unexpected token'); } };
        const res = await POST(badRequest as any);
        expect(res.status).toBe(400);
        expect(mockVerify).not.toHaveBeenCalled();
    });

    it('returns 400 when token is missing', async () => {
        const res = await POST(makeRequest({ action: 'all' }) as any);
        expect(res.status).toBe(400);
    });

    it('returns 400 when token is invalid', async () => {
        mockVerify.mockResolvedValue(null);
        const res = await POST(makeRequest({ token: 'bad', action: 'all' }) as any);
        expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown action', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', cityId: 'c1', exp: Date.now() + 1000 });
        const res = await POST(makeRequest({ token: 'ok', action: 'foo' }) as any);
        expect(res.status).toBe(400);
        expect(mockDisableCity).not.toHaveBeenCalled();
        expect(mockDisableAll).not.toHaveBeenCalled();
    });

    it('unsubscribes from all channels when action is "all"', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', cityId: 'c1', exp: Date.now() + 1000 });
        mockUpdateProfile.mockResolvedValue({} as any);
        mockDisableAll.mockResolvedValue(undefined as any);

        const res = await POST(makeRequest({ token: 'ok', action: 'all' }) as any);
        expect(res.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenCalledWith('u1', {
            allowProductUpdates: false,
            allowPetitionUpdates: false,
        });
        expect(mockDisableAll).toHaveBeenCalledWith('u1');
        expect(mockDisableCity).not.toHaveBeenCalled();
    });

    it('unsubscribes from a city when action is "city"', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', cityId: 'c1', exp: Date.now() + 1000 });
        mockDisableCity.mockResolvedValue({} as any);

        const res = await POST(makeRequest({ token: 'ok', action: 'city' }) as any);
        expect(res.status).toBe(200);
        expect(mockDisableCity).toHaveBeenCalledWith('u1', 'c1');
        expect(mockDisableAll).not.toHaveBeenCalled();
    });

    it('updates communication preferences when action is "preferences"', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', cityId: 'c1', exp: Date.now() + 1000 });
        mockUpdateProfile.mockResolvedValue({} as any);

        const res = await POST(makeRequest({
            token: 'ok',
            action: 'preferences',
            allowProductUpdates: false,
            allowPetitionUpdates: true,
        }) as any);
        expect(res.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenCalledWith('u1', {
            allowProductUpdates: false,
            allowPetitionUpdates: true,
        });
        expect(mockDisableCity).not.toHaveBeenCalled();
        expect(mockDisableAll).not.toHaveBeenCalled();
    });

    it('also unsubscribes from city when "preferences" is called with unsubscribeCity=true', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', cityId: 'c1', exp: Date.now() + 1000 });
        mockUpdateProfile.mockResolvedValue({} as any);
        mockDisableCity.mockResolvedValue({} as any);

        const res = await POST(makeRequest({
            token: 'ok',
            action: 'preferences',
            allowProductUpdates: false,
            allowPetitionUpdates: false,
            unsubscribeCity: true,
        }) as any);
        expect(res.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenCalledWith('u1', {
            allowProductUpdates: false,
            allowPetitionUpdates: false,
        });
        expect(mockDisableCity).toHaveBeenCalledWith('u1', 'c1');
        expect(mockDisableAll).not.toHaveBeenCalled();
    });

    it('does not touch city when "preferences" is called without unsubscribeCity', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', cityId: 'c1', exp: Date.now() + 1000 });
        mockUpdateProfile.mockResolvedValue({} as any);

        const res = await POST(makeRequest({
            token: 'ok',
            action: 'preferences',
            allowProductUpdates: true,
            allowPetitionUpdates: true,
        }) as any);
        expect(res.status).toBe(200);
        expect(mockDisableCity).not.toHaveBeenCalled();
    });

    it('returns 400 when "preferences" action is missing booleans', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', cityId: 'c1', exp: Date.now() + 1000 });
        const res = await POST(makeRequest({
            token: 'ok',
            action: 'preferences',
            allowProductUpdates: 'yes', // wrong type
        }) as any);
        expect(res.status).toBe(400);
        expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it('returns 400 for "city" action when token has no cityId', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', exp: Date.now() + 1000 });

        const res = await POST(makeRequest({ token: 'ok', action: 'city' }) as any);
        expect(res.status).toBe(400);
        expect(mockDisableCity).not.toHaveBeenCalled();
    });

    it('returns 400 for "preferences" with unsubscribeCity=true when token has no cityId', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', exp: Date.now() + 1000 });

        const res = await POST(makeRequest({
            token: 'ok',
            action: 'preferences',
            allowProductUpdates: false,
            allowPetitionUpdates: false,
            unsubscribeCity: true,
        }) as any);
        expect(res.status).toBe(400);
        expect(mockUpdateProfile).not.toHaveBeenCalled();
        expect(mockDisableCity).not.toHaveBeenCalled();
    });

    it('handles "preferences" without unsubscribeCity for a city-less token', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', exp: Date.now() + 1000 });
        mockUpdateProfile.mockResolvedValue({} as any);

        const res = await POST(makeRequest({
            token: 'ok',
            action: 'preferences',
            allowProductUpdates: false,
            allowPetitionUpdates: true,
        }) as any);
        expect(res.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenCalledWith('u1', {
            allowProductUpdates: false,
            allowPetitionUpdates: true,
        });
        expect(mockDisableCity).not.toHaveBeenCalled();
    });

    it('returns 500 for an unexpected DB error', async () => {
        mockVerify.mockResolvedValue({ userId: 'u1', cityId: 'c1', exp: Date.now() + 1000 });
        mockDisableAll.mockRejectedValue(new Error('db down'));
        mockUpdateProfile.mockResolvedValue({} as any);

        const res = await POST(makeRequest({ token: 'ok', action: 'all' }) as any);
        expect(res.status).toBe(500);
    });
});
