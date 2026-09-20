import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@prisma/client';
import { UserInfoForm } from '../UserInfoForm';
import { setVoicePrintConsent } from '@/lib/actions/personConsent';

jest.mock('next-intl', () => ({
    useTranslations: () => {
        const t = (key: string, values?: Record<string, string | number>) =>
            values ? `${key} ${Object.values(values).join(' ')}` : key;
        // The rich form: the key, then the email inside the tag the message names.
        t.rich = (key: string, values: { email: string; mail: (chunks: string) => React.ReactNode }) =>
            createElement('span', null, key, ' ', values.mail(values.email));
        return t;
    },
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
    it('shows a consent that OpenCouncil recorded as given and locked, with the way to revoke it', async () => {
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: 'ADMIN' }],
        }));
        const box = screen.getByLabelText('voicePrintConsentLabel') as HTMLButtonElement;
        expect(box.getAttribute('aria-checked')).toBe('true');
        expect(box.disabled).toBe(true);
        expect(screen.getByText('voicePrintConsentHint')).toBeTruthy();
        expect(screen.getByText('voicePrintConsentOnPaper', { exact: false })).toBeTruthy();
        expect((screen.getByText('dpo@opencouncil.gr') as HTMLAnchorElement).getAttribute('href')).toBe('mailto:dpo@opencouncil.gr');

        fireEvent.click(box);
        fireEvent.click(screen.getByText('savePersonalInfo'));
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(mockedSetConsent).not.toHaveBeenCalled();
    });

    it('drops a pending edit when the box becomes locked meanwhile', async () => {
        const mine = { id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: 'PERSON' as const };
        const { rerender } = render(createElement(UserInfoForm, { user, isOnboarded: true, persons: [mine] }));
        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        // A superadmin records the consent, then withdraws it: the old untick must not come back.
        rerender(createElement(UserInfoForm, { user, isOnboarded: true, persons: [{ ...mine, consent: 'ADMIN' }] }));
        rerender(createElement(UserInfoForm, { user, isOnboarded: true, persons: [mine] }));
        expect(screen.getByLabelText('voicePrintConsentLabel').getAttribute('aria-checked')).toBe('true');
    });

    it('shows no revoke line for a consent the person gave', () => {
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: 'PERSON' }],
        }));
        expect((screen.getByLabelText('voicePrintConsentLabel') as HTMLButtonElement).disabled).toBe(false);
        expect(screen.queryByText('dpo@opencouncil.gr')).toBeNull();
    });

    it('shows no box for an account with no person', () => {
        render(createElement(UserInfoForm, { user, isOnboarded: false }));
        expect(screen.queryByText('voicePrintConsentLabel')).toBeNull();
    });

    it('saves the tick with the personal details, from the one button', async () => {
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: false,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: null }],
        }));
        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        fireEvent.click(screen.getByText('savePersonalInfo'));

        await waitFor(() => expect(mockedSetConsent).toHaveBeenCalledWith('person-1', true));
        expect(global.fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'POST' }));
    });

    it('writes no consent when the box did not change', async () => {
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: 'PERSON' }],
        }));
        fireEvent.click(screen.getByText('savePersonalInfo'));
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(mockedSetConsent).not.toHaveBeenCalled();
    });

    it('names the person only when the account is more than one person', () => {
        const { unmount } = render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: null }],
        }));
        expect(screen.getByLabelText('voicePrintConsentLabel')).toBeTruthy();
        unmount();
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [
                { id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: null },
                { id: 'person-2', name: 'Αικατερίνη Μανιμανάκη', claimed: true, consent: null },
            ],
        }));
        expect(screen.getByLabelText('voicePrintConsentLabel (Αικατερίνη Μανιμανάκη)')).toBeTruthy();
    });

    it('saves a withdrawal even when the account form would be refused', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { code: 'phone_in_use' } }) }) as unknown as typeof fetch;
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: 'PERSON' }],
        }));
        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        fireEvent.click(screen.getByText('savePersonalInfo'));
        await waitFor(() => expect(mockedSetConsent).toHaveBeenCalledWith('person-1', false));
        expect(await screen.findByText('phoneInUse')).toBeTruthy();
    });

    it('shows an error and keeps the box when the action fails', async () => {
        mockedSetConsent.mockRejectedValue(new Error('down'));
        render(createElement(UserInfoForm, {
            user,
            isOnboarded: true,
            persons: [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: null }],
        }));
        fireEvent.click(screen.getByLabelText('voicePrintConsentLabel'));
        fireEvent.click(screen.getByText('savePersonalInfo'));

        await waitFor(() => expect(screen.getByText('voicePrintConsentError')).toBeTruthy());
        expect((screen.getByLabelText('voicePrintConsentLabel') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
    });

    it('prefills an empty name from the council record, and keeps a name the account already has', () => {
        const persons = [{ id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: null }];
        const { unmount } = render(createElement(UserInfoForm, { user: { ...user, name: null } as User, isOnboarded: false, persons }));
        expect((document.getElementById('name') as HTMLInputElement).value).toBe('Αδάμ Μπούτζουκας');
        unmount();
        render(createElement(UserInfoForm, { user, isOnboarded: true, persons }));
        expect((document.getElementById('name') as HTMLInputElement).value).toBe('Α. Β.');
    });

    it('does not guess a name when the account is linked to more than one person', () => {
        const persons = [
            { id: 'person-1', name: 'Αδάμ Μπούτζουκας', claimed: true, consent: null },
            { id: 'person-2', name: 'Αικατερίνη Μανιμανάκη', claimed: true, consent: null },
        ];
        render(createElement(UserInfoForm, { user: { ...user, name: null } as User, isOnboarded: false, persons }));
        expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
    });
});
