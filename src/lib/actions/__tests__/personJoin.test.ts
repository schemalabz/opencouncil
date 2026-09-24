/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod', NEXTAUTH_URL: 'https://opencouncil.gr' } }));
const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));
const mockClaimPerson = jest.fn();
jest.mock('@/lib/db/personClaim', () => ({ claimPerson: (...args: unknown[]) => mockClaimPerson(...args) }));
const mockConsents = jest.fn();
jest.mock('@/lib/db/personConsent', () => ({ getVoicePrintConsents: (...args: unknown[]) => mockConsents(...args) }));
const mockAlert = jest.fn();
jest.mock('@/lib/discord', () => ({ sendPersonClaimedAdminAlert: (...args: unknown[]) => mockAlert(...args) }));
const mockSignIn = jest.fn();
jest.mock('@/lib/serverSignIn', () => ({ signInWithEmail: (...args: unknown[]) => mockSignIn(...args) }));

import { generatePersonClaimToken, verifyJoinConfirmation } from '@/lib/auth/personClaim';
import { claimWithToken, sendJoinEmail } from '@/lib/actions/personJoin';

beforeEach(() => {
    for (const m of [mockGetCurrentUser, mockClaimPerson, mockAlert, mockSignIn, mockConsents]) m.mockReset();
    mockConsents.mockResolvedValue(new Map());
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('claimWithToken', () => {
    it('refuses a bad code before it looks at the session', async () => {
        expect(await claimWithToken('forged.token')).toBe('invalid');
        expect(mockGetCurrentUser).not.toHaveBeenCalled();
    });

    it('says so when the session is gone, so the flow can ask for the email', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        expect(await claimWithToken(generatePersonClaimToken('person-1'))).toBe('signed_out');
        expect(mockClaimPerson).not.toHaveBeenCalled();
    });

    it('claims for the signed-in account and alerts only on a new link', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
        mockClaimPerson.mockResolvedValue({ status: 'linked', cityId: 'chania', cityName: 'Χανιά', personName: 'Α. Β.' });
        expect(await claimWithToken(generatePersonClaimToken('person-1'))).toBe('linked');
        expect(mockClaimPerson).toHaveBeenCalledWith('user-1', 'person-1');
        expect(mockAlert).toHaveBeenCalledTimes(1);
        mockClaimPerson.mockResolvedValue({ status: 'already_yours' });
        expect(await claimWithToken(generatePersonClaimToken('person-1'))).toBe('already_yours');
        expect(mockAlert).toHaveBeenCalledTimes(1);
    });

    it('says when a consent answers for the person, so the flow asks nothing more', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1' });
        mockClaimPerson.mockResolvedValue({ status: 'linked', cityId: 'chania', cityName: 'Χανιά', personName: 'Α. Β.' });
        mockConsents.mockResolvedValue(new Map([['person-1', 'ADMIN']]));
        expect(await claimWithToken(generatePersonClaimToken('person-1'))).toBe('consented');
        expect(mockConsents).toHaveBeenCalledWith(['person-1']);
        expect(mockAlert).toHaveBeenCalledTimes(1);

        // After a new claim, only a paper consent answers for the person: one
        // given in the app this instant is a delegate's, and the person is asked.
        mockConsents.mockResolvedValue(new Map([['person-1', 'PERSON']]));
        expect(await claimWithToken(generatePersonClaimToken('person-1'))).toBe('linked');
        // On a second scan of their own code, any consent in force does.
        mockClaimPerson.mockResolvedValue({ status: 'already_yours' });
        expect(await claimWithToken(generatePersonClaimToken('person-1'))).toBe('consented');

        // A refused claim never reads the consent of somebody else's person.
        mockConsents.mockClear();
        mockClaimPerson.mockResolvedValue({ status: 'already_linked' });
        expect(await claimWithToken(generatePersonClaimToken('person-1'))).toBe('already_linked');
        expect(mockConsents).not.toHaveBeenCalled();
    });
});

describe('sendJoinEmail', () => {
    it('sends the sign-in email with a return path built from the verified code', async () => {
        mockSignIn.mockResolvedValue('https://opencouncil.gr/api/auth/verify-request');
        const token = generatePersonClaimToken('person-1');
        expect(await sendJoinEmail(token, '  Maria@Gmail.com ')).toEqual({ ok: true });
        const form = mockSignIn.mock.calls[0][0] as FormData;
        expect(form.get('email')).toBe('maria@gmail.com');
        const callback = new URL(form.get('callbackUrl') as string, 'https://opencouncil.gr');
        expect(callback.pathname).toBe(`/api/join/${token}`);
        const mark = callback.searchParams.get('confirmed');
        expect(verifyJoinConfirmation(token, mark, 'maria@gmail.com')).toBe(true);
        expect(verifyJoinConfirmation(token, mark, 'other@gmail.com')).toBe(false);
    });

    it('sends nothing for a bad code or a bad address', async () => {
        expect(await sendJoinEmail('forged.token', 'maria@gmail.com')).toEqual({ ok: false, error: 'invalid_code' });
        expect(await sendJoinEmail(generatePersonClaimToken('person-1'), 'maria@')).toEqual({ ok: false, error: 'invalid_email' });
        expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('reports a failed send instead of throwing', async () => {
        mockSignIn.mockRejectedValue(new Error('resend down'));
        expect(await sendJoinEmail(generatePersonClaimToken('person-1'), 'maria@gmail.com')).toEqual({ ok: false, error: 'send_failed' });
    });
});
