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
// The Tabs component links tabs through next-intl's Link and reads the path
// through its usePathname, both ESM-only under jest.
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => createElement('a', { href }, children),
    usePathname: () => '/profile',
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

    it('shows one box per administered person, named, and saves the tick with its own button', async () => {
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: false,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: false }],
        }));
        expect(screen.getByText('voicePrintConsentDescription Αδάμ Μπούτζουκας')).toBeTruthy();

        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        fireEvent.click(screen.getByText('voicePrintConsentSave'));

        await waitFor(() => expect(mockedSetConsent).toHaveBeenCalledWith('person-1', true));
        // Its own form: the account fields are not saved along with it.
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('saves a withdrawal even when the account form would be refused', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { code: 'phone_in_use' } }) }) as unknown as typeof fetch;
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: true }],
        }));
        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        fireEvent.click(screen.getByText('voicePrintConsentSave'));
        await waitFor(() => expect(mockedSetConsent).toHaveBeenCalledWith('person-1', false));
    });

    it('shows an error and keeps the box when the action fails', async () => {
        mockedSetConsent.mockRejectedValue(new Error('down'));
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: false }],
        }));
        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        fireEvent.click(screen.getByText('voicePrintConsentSave'));

        await waitFor(() => expect(screen.getByText('voicePrintConsentError')).toBeTruthy());
        expect((screen.getByLabelText('voicePrintConsentLabel') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
    });

    it('prefills an empty name from the council record, and keeps a name the account already has', () => {
        const persons = [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: false }];
        const { unmount } = render(createElement(UserInfoForm, { user: { ...user, name: null } as User, isOnboarded: false, persons }));
        expect((document.getElementById('name') as HTMLInputElement).value).toBe('Αδάμ Μπούτζουκας');
        unmount();
        render(createElement(UserInfoForm, { user, isOnboarded: true, persons }));
        expect((document.getElementById('name') as HTMLInputElement).value).toBe('Α. Β.');
    });

    it('does not guess a name when the account is linked to more than one person', () => {
        const persons = [
            { id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: false },
            { id: 'person-2', name: 'Αικατερίνη Μανιμανάκη', voicePrintConsent: false },
        ];
        render(createElement(UserInfoForm, { user: { ...user, name: null } as User, isOnboarded: false, persons }));
        expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
    });

    it('keeps the consent button disabled until a tick changes', () => {
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', voicePrintConsent: true }],
        }));
        const save = screen.getByText('voicePrintConsentSave').closest('button') as HTMLButtonElement;
        expect(save.disabled).toBe(true);
        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        expect(save.disabled).toBe(false);
    });
});
