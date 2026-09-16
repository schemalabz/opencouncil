/** @jest-environment node */
const mockUpsert = jest.fn();
const mockDeleteMany = jest.fn();
const mockFindMany = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        personVoicePrintConsent: {
            upsert: (...args: unknown[]) => mockUpsert(...args),
            deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
        },
    },
}));
const mockGetCurrentUser = jest.fn();
jest.mock('@/lib/auth', () => ({ getCurrentUser: () => mockGetCurrentUser() }));

import { setVoicePrintConsent, getVoicePrintConsentedIds } from '../personConsent';

beforeEach(() => {
    mockUpsert.mockReset();
    mockDeleteMany.mockReset();
    mockFindMany.mockReset();
    mockGetCurrentUser.mockReset();
});

describe('setVoicePrintConsent', () => {
    it('records consent for a person the account administers, keeping an earlier time', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', isSuperAdmin: false, administers: [{ personId: 'person-1' }] });
        await setVoicePrintConsent('person-1', true);
        expect(mockUpsert).toHaveBeenCalledWith({ where: { personId: 'person-1' }, create: { personId: 'person-1' }, update: {} });
        expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    it('deletes the row when consent is withdrawn', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', isSuperAdmin: false, administers: [{ personId: 'person-1' }] });
        await setVoicePrintConsent('person-1', false);
        expect(mockDeleteMany).toHaveBeenCalledWith({ where: { personId: 'person-1' } });
        expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('refuses a superadmin who does not hold the link: consent is the person\'s own', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'admin', isSuperAdmin: true, administers: [] });
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/own account/);
        expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('refuses a link to a different person', async () => {
        mockGetCurrentUser.mockResolvedValue({ id: 'user-1', isSuperAdmin: false, administers: [{ personId: 'person-2' }] });
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/own account/);
    });

    it('refuses when signed out', async () => {
        mockGetCurrentUser.mockResolvedValue(null);
        await expect(setVoicePrintConsent('person-1', true)).rejects.toThrow(/signed in/);
    });

    it('refuses a non-boolean before touching the session or the database', async () => {
        await expect(setVoicePrintConsent('person-1', undefined as unknown as boolean)).rejects.toThrow(/boolean/);
        expect(mockGetCurrentUser).not.toHaveBeenCalled();
    });
});

describe('getVoicePrintConsentedIds', () => {
    it('returns the ids that have a row, and skips the query for no ids', async () => {
        mockFindMany.mockResolvedValue([{ personId: 'person-2' }]);
        expect(await getVoicePrintConsentedIds(['person-1', 'person-2'])).toEqual(new Set(['person-2']));
        expect(await getVoicePrintConsentedIds([])).toEqual(new Set());
        expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
});
