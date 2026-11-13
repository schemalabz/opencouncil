/** @jest-environment node */

jest.mock('@/env.mjs', () => ({ env: {} }));

const mockSendMagicLink = jest.fn();
jest.mock('@/lib/auth/magicLink', () => ({
    sendMagicLink: (...args: unknown[]) => mockSendMagicLink(...args),
}));

const mockUserFindUnique = jest.fn();
const mockUserCreate = jest.fn();
const mockTransaction = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        user: {
            findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
            create: (...args: unknown[]) => mockUserCreate(...args),
        },
        topic: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        $transaction: (...args: unknown[]) => mockTransaction(...args),
    },
}));

jest.mock('@/auth', () => ({
    auth: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/auth', () => ({
    getCurrentUser: jest.fn().mockResolvedValue(null),
    withUserAuthorizedToEdit: jest.fn(),
}));

jest.mock('@/lib/discord', () => ({
    sendPetitionReceivedAdminAlert: jest.fn(),
    sendUserOnboardedAdminAlert: jest.fn(),
    sendNotificationSignupAdminAlert: jest.fn(),
}));

jest.mock('@/lib/notifications/welcome', () => ({
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));

import { saveNotificationPreferences } from '../notifications';

beforeEach(() => {
    mockSendMagicLink.mockReset();
    mockUserFindUnique.mockReset();
    mockUserCreate.mockReset();
    mockTransaction.mockReset();

    mockSendMagicLink.mockResolvedValue(true);
    mockTransaction.mockResolvedValue({
        preference: {
            id: 'pref-1',
            city: { name_en: 'Chania' },
            locations: [],
            interests: [],
        },
        wasNew: true,
    });
});

describe('saveNotificationPreferences magic link destinations', () => {
    it('sends the safe, locale-aware municipality destination for a newly created user', async () => {
        mockUserFindUnique.mockResolvedValue(null);
        mockUserCreate.mockResolvedValue({ id: 'new-user-1', email: 'new@example.com' });

        const result = await saveNotificationPreferences({
            cityId: 'chania',
            email: 'new@example.com',
            name: 'New User',
            locations: [],
            topicIds: [],
            notifyByEmail: true,
            returnTo: '/en/chania/notifications',
        });

        expect(result.success).toBe(true);
        expect(mockSendMagicLink).toHaveBeenCalledTimes(1);
        expect(mockSendMagicLink).toHaveBeenCalledWith('new@example.com', '/en/chania');
    });

    it('defaults to bare municipality destination when returnTo has no locale prefix', async () => {
        mockUserFindUnique.mockResolvedValue(null);
        mockUserCreate.mockResolvedValue({ id: 'new-user-2', email: 'greek@example.com' });

        const result = await saveNotificationPreferences({
            cityId: 'chania',
            email: 'greek@example.com',
            name: 'Greek User',
            locations: [],
            topicIds: [],
            notifyByEmail: true,
            returnTo: '/chania/notifications?step=2',
        });

        expect(result.success).toBe(true);
        expect(mockSendMagicLink).toHaveBeenCalledTimes(1);
        expect(mockSendMagicLink).toHaveBeenCalledWith('greek@example.com', '/chania');
    });

    it('preserves the original returnTo destination and does not regress for existing users', async () => {
        mockUserFindUnique.mockResolvedValue({ id: 'existing-user-1', email: 'existing@example.com' });

        const result = await saveNotificationPreferences({
            cityId: 'chania',
            email: 'existing@example.com',
            name: 'Existing User',
            locations: [],
            topicIds: [],
            notifyByEmail: true,
            returnTo: '/en/chania/notifications?step=2',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('email_exists_link_sent');
        expect(mockSendMagicLink).toHaveBeenCalledTimes(1);
        // Must send returnTo back so draft preferences can be restored
        expect(mockSendMagicLink).toHaveBeenCalledWith('existing@example.com', '/en/chania/notifications?step=2');
    });
});
