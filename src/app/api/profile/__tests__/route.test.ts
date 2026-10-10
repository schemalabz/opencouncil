/** @jest-environment node */
jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/db/users', () => ({
    deleteCurrentUser: jest.fn(),
}));

jest.mock('@/lib/db/userProfile', () => ({
    updateUserProfile: jest.fn(),
}));

jest.mock('@/lib/db/phoneVerification', () => ({
    clearPhone: jest.fn(),
    setAccountPhone: jest.fn(),
}));

jest.mock('@/lib/discord', () => ({
    sendUserOnboardedAdminAlert: jest.fn(),
}));

import type { User } from '@prisma/client';
import { DELETE, POST } from '../route';
import { getCurrentUser } from '@/lib/auth';
import { clearPhone, setAccountPhone } from '@/lib/db/phoneVerification';
import { deleteCurrentUser } from '@/lib/db/users';
import { updateUserProfile } from '@/lib/db/userProfile';
import { sendUserOnboardedAdminAlert } from '@/lib/discord';

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockDeleteCurrentUser = deleteCurrentUser as jest.MockedFunction<typeof deleteCurrentUser>;
const mockUpdateUserProfile = updateUserProfile as jest.MockedFunction<typeof updateUserProfile>;
const mockAlert = sendUserOnboardedAdminAlert as jest.MockedFunction<typeof sendUserOnboardedAdminAlert>;
const mockSetAccountPhone = setAccountPhone as jest.MockedFunction<typeof setAccountPhone>;
const mockClearPhone = clearPhone as jest.MockedFunction<typeof clearPhone>;

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

const PHONE = '+306943472297';
const session = { id: 'u1', onboarded: true } as unknown as CurrentUser;
const account = { id: 'u1', name: 'Α.', phone: PHONE, onboarded: true } as unknown as User;
const post = (body: object) =>
    POST(new Request('http://localhost/api/profile', { method: 'POST', body: JSON.stringify(body) }));

/**
 * The number rides the profile save (issue #813): one write with the rest,
 * unproved. Only a number another account typed first is held back for a code.
 */
describe('POST /api/profile', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCurrentUser.mockResolvedValue(session);
    });

    it('alerts, naming the user, when the save completes onboarding', async () => {
        mockGetCurrentUser.mockResolvedValue({ ...session, onboarded: false });
        mockUpdateUserProfile.mockResolvedValue(account);
        const res = await post({ name: 'Maria', onboarded: true });

        expect(res.status).toBe(200);
        expect(mockAlert).toHaveBeenCalledWith({ cityName: 'General', onboardingSource: 'profile', signedInUserId: 'u1' });
    });

    it('sends no alert for a save by an onboarded user', async () => {
        mockUpdateUserProfile.mockResolvedValue(account);

        const res = await post({ name: 'Maria', onboarded: true });

        expect(res.status).toBe(200);
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it('saves the number with the rest in one write', async () => {
        mockSetAccountPhone.mockResolvedValue({ ok: true, user: account });
        const res = await post({ name: 'Α.', phone: PHONE });
        expect(res.status).toBe(200);
        expect(mockSetAccountPhone).toHaveBeenCalledWith('u1', PHONE, { name: 'Α.' });
        expect(mockUpdateUserProfile).not.toHaveBeenCalled();
        expect(await res.json()).not.toHaveProperty('phoneNeedsCode');
    });

    it('refuses a number another account proved, and saves nothing', async () => {
        mockSetAccountPhone.mockResolvedValue({ ok: false, code: 'phone_in_use' });
        const res = await post({ name: 'Α.', phone: PHONE });
        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ error: { code: 'phone_in_use' } });
        expect(mockUpdateUserProfile).not.toHaveBeenCalled();
    });

    it('saves the rest alone and asks for the code when another account typed the number', async () => {
        mockSetAccountPhone.mockResolvedValue({ ok: false, code: 'needs_code' });
        mockUpdateUserProfile.mockResolvedValue(account);
        const res = await post({ name: 'Α.', phone: PHONE });
        expect(res.status).toBe(200);
        expect(mockUpdateUserProfile).toHaveBeenCalledWith('u1', { name: 'Α.' });
        expect((await res.json()).phoneNeedsCode).toBe(true);
    });

    it('holds the registration back with a number that needs the code', async () => {
        // The form must stay, with the code dialog: a registered reader
        // lands on the settings, where the dialog is gone.
        mockGetCurrentUser.mockResolvedValue({ ...session, onboarded: false });
        mockSetAccountPhone.mockResolvedValue({ ok: false, code: 'needs_code' });
        mockUpdateUserProfile.mockResolvedValue({ ...account, onboarded: false });
        const res = await post({ name: 'Α.', phone: PHONE, onboarded: true });
        expect(res.status).toBe(200);
        expect(mockUpdateUserProfile.mock.calls[0][1]).toEqual({ name: 'Α.' });
        expect(mockUpdateUserProfile.mock.calls[0][1].onboarded).toBeUndefined();
        expect(mockAlert).not.toHaveBeenCalled();
        expect((await res.json()).phoneNeedsCode).toBe(true);
    });

    it('removes the number with the rest when the field is emptied', async () => {
        mockClearPhone.mockResolvedValue(account);
        const res = await post({ phone: null, allowFeedbackCalls: false });
        expect(res.status).toBe(200);
        expect(mockClearPhone).toHaveBeenCalledWith('u1', { allowFeedbackCalls: false });
        expect(mockSetAccountPhone).not.toHaveBeenCalled();
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
