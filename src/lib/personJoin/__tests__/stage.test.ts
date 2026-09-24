/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod', NEXTAUTH_URL: 'https://opencouncil.gr' } }));
const mockGetJoinPerson = jest.fn();
jest.mock('@/lib/db/personClaim', () => ({ getJoinPerson: (...args: unknown[]) => mockGetJoinPerson(...args) }));
const mockConsented = jest.fn();
jest.mock('@/lib/db/personConsent', () => ({ getVoicePrintConsents: (...args: unknown[]) => mockConsented(...args) }));
const mockSubscribed = jest.fn();
jest.mock('@/lib/notis/reader', () => ({ readerSubscribedToCity: (...args: unknown[]) => mockSubscribed(...args) }));

import { generatePersonClaimToken } from '@/lib/auth/personClaim';
import { getJoinStage } from '@/lib/personJoin/stage';

const row = (administrators: { userId: string }[], supportsNotifications = true) => ({
    id: 'person-1',
    name: 'Αδάμ Μπούτζουκας',
    image: null,
    cityId: 'chania',
    city: { name: 'Χανιά', supportsNotifications },
    roles: [{ name: 'Αντιδήμαρχος Πολιτισμού', cityId: 'chania', partyId: null, administrativeBodyId: null, administrativeBody: null }],
    administrators,
});
const token = () => generatePersonClaimToken('person-1');

beforeEach(() => {
    mockGetJoinPerson.mockReset();
    mockConsented.mockReset();
    mockConsented.mockResolvedValue(new Map());
    mockSubscribed.mockReset();
    mockSubscribed.mockResolvedValue(false);
});

describe('getJoinStage', () => {
    it('is invalid for no code, a forged code, an expired code and a person that is gone', async () => {
        expect(await getJoinStage(undefined, null)).toEqual({ kind: 'invalid' });
        expect(await getJoinStage('forged.token', null)).toEqual({ kind: 'invalid' });
        expect(await getJoinStage(generatePersonClaimToken('person-1', new Date(Date.now() - 1)), null)).toEqual({ kind: 'invalid' });
        mockGetJoinPerson.mockResolvedValue(null);
        expect(await getJoinStage(token(), 'user-1')).toEqual({ kind: 'invalid' });
    });

    it('asks "is this you" while nobody has claimed the person, and shows who the code is for', async () => {
        mockGetJoinPerson.mockResolvedValue(row([]));
        const stage = await getJoinStage(token(), null);
        expect(stage).toEqual({
            kind: 'confirm',
            signedIn: false,
            person: { id: 'person-1', name: 'Αδάμ Μπούτζουκας', image: null, title: 'Αντιδήμαρχος Πολιτισμού', cityId: 'chania', cityName: 'Χανιά' },
        });
        expect(await getJoinStage(token(), 'user-1')).toMatchObject({ kind: 'confirm', signedIn: true });
    });

    it('offers the city\'s notifications to a reader who does not get them, and asks nothing without an account', async () => {
        mockGetJoinPerson.mockResolvedValue(row([]));
        // No account to ask about: the sign-in email renders this stage again.
        expect(await getJoinStage(token(), null)).toEqual({ kind: 'confirm', signedIn: false, person: expect.anything() });
        expect(mockSubscribed).not.toHaveBeenCalled();

        expect(await getJoinStage(token(), 'user-1')).toMatchObject({ offerNotifications: true });
        expect(mockSubscribed).toHaveBeenCalledWith('user-1', 'chania');
        mockSubscribed.mockResolvedValue(true);
        expect(await getJoinStage(token(), 'user-1')).toMatchObject({ offerNotifications: false });

        mockGetJoinPerson.mockResolvedValue(row([{ userId: 'user-1' }]));
        expect(await getJoinStage(token(), 'user-1', true)).toMatchObject({ kind: 'consent', offerNotifications: false });
        mockSubscribed.mockResolvedValue(false);
        expect(await getJoinStage(token(), 'user-1', true)).toMatchObject({ kind: 'consent', offerNotifications: true });
    });

    it('offers nothing for a city without notifications, without asking the list', async () => {
        mockGetJoinPerson.mockResolvedValue(row([], false));
        expect(await getJoinStage(token(), 'user-1')).toMatchObject({ kind: 'confirm', offerNotifications: false });
        mockGetJoinPerson.mockResolvedValue(row([{ userId: 'user-1' }], false));
        expect(await getJoinStage(token(), 'user-1', true)).toMatchObject({ kind: 'consent', offerNotifications: false });
        expect(mockSubscribed).not.toHaveBeenCalled();
    });

    it('is on the consent step for the claiming account inside the flow, with the answer it already gave', async () => {
        mockGetJoinPerson.mockResolvedValue(row([{ userId: 'user-1' }]));
        expect(await getJoinStage(token(), 'user-1', true)).toMatchObject({ kind: 'consent', consented: false });
        mockConsented.mockResolvedValue(new Map([['person-1', 'PERSON']]));
        expect(await getJoinStage(token(), 'user-1', true)).toMatchObject({ kind: 'consent', consented: true });
        expect(mockConsented).toHaveBeenLastCalledWith(['person-1']);
    });

    it('is spent on a fresh scan once the person has an account, for the owner too', async () => {
        mockGetJoinPerson.mockResolvedValue(row([{ userId: 'user-1' }]));
        expect(await getJoinStage(token(), 'user-1')).toMatchObject({ kind: 'used', signedIn: true, own: true });
        expect(mockConsented).not.toHaveBeenCalled();
        expect(mockSubscribed).not.toHaveBeenCalled();
    });

    it('opens only the owner\'s step for a code that expired during the email round trip', async () => {
        const justExpired = generatePersonClaimToken('person-1', new Date(Date.now() - 60 * 60 * 1000));
        mockGetJoinPerson.mockResolvedValue(row([{ userId: 'user-1' }]));
        expect(await getJoinStage(justExpired, 'user-1', true)).toMatchObject({ kind: 'consent' });
        expect(await getJoinStage(justExpired, 'user-1')).toEqual({ kind: 'invalid' });
        expect(await getJoinStage(justExpired, 'user-9', true)).toEqual({ kind: 'invalid' });
        mockGetJoinPerson.mockResolvedValue(row([]));
        expect(await getJoinStage(justExpired, 'user-1', true)).toEqual({ kind: 'invalid' });
    });

    it('is spent for everybody else, signed in or not, inside the flow or not', async () => {
        mockGetJoinPerson.mockResolvedValue(row([{ userId: 'user-9' }]));
        expect(await getJoinStage(token(), 'user-1')).toMatchObject({ kind: 'used', signedIn: true, own: false });
        expect(await getJoinStage(token(), 'user-1', true)).toMatchObject({ kind: 'used', own: false });
        expect(await getJoinStage(token(), null)).toMatchObject({ kind: 'used', signedIn: false, own: false });
    });
});
