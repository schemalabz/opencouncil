/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_SECRET: 'test-secret-do-not-use-in-prod', NEXTAUTH_URL: 'https://opencouncil.gr' } }));
const mockGetJoinPerson = jest.fn();
jest.mock('@/lib/db/personClaim', () => ({ getJoinPerson: (...args: unknown[]) => mockGetJoinPerson(...args) }));
const mockConsented = jest.fn();
jest.mock('@/lib/db/personConsent', () => ({ getVoicePrintConsentedIds: (...args: unknown[]) => mockConsented(...args) }));

import { generatePersonClaimToken } from '@/lib/auth/personClaim';
import { getJoinStage } from '../stage';

const row = (administrators: { userId: string }[]) => ({
    id: 'person-1',
    name: 'Αδάμ Μπούτζουκας',
    image: null,
    cityId: 'chania',
    city: { name: 'Χανιά' },
    roles: [{ name: 'Αντιδήμαρχος Πολιτισμού', cityId: 'chania', partyId: null, administrativeBodyId: null, administrativeBody: null }],
    administrators,
});
const token = () => generatePersonClaimToken('person-1');

beforeEach(() => {
    mockGetJoinPerson.mockReset();
    mockConsented.mockReset();
    mockConsented.mockResolvedValue(new Set());
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

    it('is on the consent step for the claiming account inside the flow, with the answer it already gave', async () => {
        mockGetJoinPerson.mockResolvedValue(row([{ userId: 'user-1' }]));
        expect(await getJoinStage(token(), 'user-1', true)).toMatchObject({ kind: 'consent', consented: false });
        mockConsented.mockResolvedValue(new Set(['person-1']));
        expect(await getJoinStage(token(), 'user-1', true)).toMatchObject({ kind: 'consent', consented: true });
        expect(mockConsented).toHaveBeenLastCalledWith(['person-1'], 'user-1');
    });

    it('is spent on a fresh scan once the person has an account, for the owner too', async () => {
        mockGetJoinPerson.mockResolvedValue(row([{ userId: 'user-1' }]));
        expect(await getJoinStage(token(), 'user-1')).toMatchObject({ kind: 'used', signedIn: true, own: true });
        expect(mockConsented).not.toHaveBeenCalled();
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
