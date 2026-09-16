import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@prisma/client';
import { UserInfoForm } from '../UserInfoForm';
import { setVoicePrintConsent } from '@/lib/actions/personConsent';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
jest.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: jest.fn() }),
    usePathname: () => '/profile',
    useSearchParams: () => new URLSearchParams(),
}));
// The Tabs component links tabs through next-intl's Link, which is ESM-only under jest.
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => createElement('a', { href }, children),
}));
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }));
jest.mock('@/lib/actions/personConsent', () => ({ setVoicePrintConsent: jest.fn() }));
jest.mock('@/components/profile/NotificationPreferencesSection', () => ({
    NotificationPreferencesSection: () => null,
}));

const mockedSetConsent = setVoicePrintConsent as jest.MockedFunction<typeof setVoicePrintConsent>;

// Radix's Checkbox measures itself with ResizeObserver, which jsdom lacks.
beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

const user = {
    id: 'user-1',
    name: 'Α. Β.',
    email: 'a@b.test',
    phone: null,
    allowProductUpdates: true,
    allowPetitionUpdates: false,
    allowFeedbackCalls: true,
    updatedAt: new Date('2026-09-01T10:00:00Z'),
} as unknown as User;

beforeEach(() => {
    mockedSetConsent.mockReset();
    mockedSetConsent.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

describe('UserInfoForm voiceprint consent', () => {
    it('shows no box for an account with no person', () => {
        render(createElement(UserInfoForm, { user, isOnboarded: false }));
        expect(screen.queryByText('voicePrintConsentLabel')).toBeNull();
    });

    it('shows one box per administered person, named, and saves the tick with the personal info', async () => {
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: false,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: false }],
        }));
        expect(screen.getByText('voicePrintConsentDescription Αδάμ Μπούτζουκας')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        fireEvent.click(screen.getByText('savePersonalInfo'));

        await waitFor(() => expect(mockedSetConsent).toHaveBeenCalledWith('person-1', true));
        expect(global.fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'POST' }));
    });

    it('shows an error and keeps the box when the action fails', async () => {
        mockedSetConsent.mockRejectedValue(new Error('down'));
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: false }],
        }));
        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        fireEvent.click(screen.getByText('savePersonalInfo'));

        await waitFor(() => expect(screen.getByText('voicePrintConsentError')).toBeTruthy());
        expect((screen.getByLabelText('voicePrintConsentLabel') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
    });

    it('does not call the action when the tick did not change', async () => {
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: true }],
        }));
        fireEvent.click(screen.getByText('savePersonalInfo'));
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(mockedSetConsent).not.toHaveBeenCalled();
    });
});
