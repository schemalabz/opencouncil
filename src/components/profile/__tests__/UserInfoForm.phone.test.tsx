import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@prisma/client';
import { UserInfoForm } from '../UserInfoForm';
import { confirmPhoneCode, requestPhoneCode } from '@/lib/actions/phoneVerification';

jest.mock('next-intl', () => ({
    useLocale: () => 'el',
    useTranslations: () => {
        const t = (key: string, values?: Record<string, string | number>) =>
            values ? `${key} ${Object.values(values).join(' ')}` : key;
        t.rich = (key: string) => key;
        return t;
    },
}));
const refresh = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({ refresh }),
}));
jest.mock('@/lib/actions/personConsent', () => ({ setVoicePrintConsent: jest.fn() }));
jest.mock('@/lib/actions/phoneVerification', () => ({ requestPhoneCode: jest.fn(), confirmPhoneCode: jest.fn() }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

const mockedRequest = requestPhoneCode as jest.MockedFunction<typeof requestPhoneCode>;
const mockedConfirm = confirmPhoneCode as jest.MockedFunction<typeof confirmPhoneCode>;

const PHONE = '+306943472297';

function user(overrides: Partial<User> = {}): User {
    return {
        id: 'user-1',
        name: 'Α. Β.',
        email: 'a@b.test',
        phone: PHONE,
        phoneVerifiedAt: null,
        updatedAt: new Date('2026-09-01T10:00:00Z'),
        ...overrides,
    } as unknown as User;
}

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
});

/**
 * Proving the account's number with a code is optional (issue #813): the
 * field offers it, the dialog asks for the code, and the account is
 * refreshed once it matches.
 */
describe('UserInfoForm phone verification', () => {
    it('offers the code for a number the reader has not proved, and confirms it', async () => {
        mockedRequest.mockResolvedValue({ ok: true, channel: 'log' });
        mockedConfirm.mockResolvedValue({ ok: true, phone: PHONE });
        render(createElement(UserInfoForm, { user: user(), isOnboarded: true }));

        expect(screen.getByText('phoneUnverified')).toBeInTheDocument();
        fireEvent.click(screen.getByText('phoneVerify'));

        // The form asks for the code at once, for the number and in the reader's language.
        await waitFor(() => expect(mockedRequest).toHaveBeenCalledWith({ phone: PHONE, locale: 'el' }));
        expect(await screen.findByText('devLog +30 694 ··· 2297')).toBeInTheDocument();

        // The sixth digit checks the code; there is no button to press.
        fireEvent.change(screen.getByLabelText('codeLabel'), { target: { value: '482913' } });

        await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('482913'));
        // The field says so at once, before the refresh brings the server's answer.
        expect(await screen.findByText('phoneVerified')).toBeInTheDocument();
        expect(refresh).toHaveBeenCalled();
        // The profile save itself was not touched: the code form owns the number.
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('says why a code was refused and counts the attempts left', async () => {
        mockedRequest.mockResolvedValue({ ok: true, channel: 'sms' });
        mockedConfirm.mockResolvedValue({ ok: false, code: 'code_invalid', attemptsLeft: 4 });
        render(createElement(UserInfoForm, { user: user(), isOnboarded: true }));

        fireEvent.click(screen.getByText('phoneVerify'));
        expect(await screen.findByText('sentTo +30 694 ··· 2297')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('codeLabel'), { target: { value: '000000' } });

        expect(await screen.findByText('errors.code_invalid 4')).toBeInTheDocument();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('says when the next code can go once a send limit is reached, with no button and no error', async () => {
        mockedRequest.mockResolvedValue({ ok: false, code: 'too_many', retryAfterMs: 380_000 });
        render(createElement(UserInfoForm, { user: user(), isOnboarded: true }));

        fireEvent.click(screen.getByText('phoneVerify'));

        expect(await screen.findByText('limited 6:20')).toBeInTheDocument();
        expect(screen.queryByText('send')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        // Nothing to postpone: the dialog's own close is the way out.
        expect(screen.queryByText('cancel')).not.toBeInTheDocument();
    });

    it('marks a proved number, and says nothing about a number still being typed', () => {
        render(createElement(UserInfoForm, { user: user({ phoneVerifiedAt: new Date() }), isOnboarded: true }));
        expect(screen.getByText('phoneVerified')).toBeInTheDocument();
        expect(screen.queryByText('phoneUnverified')).not.toBeInTheDocument();
    });

    it('saves a number with the form, and opens the code only when another account typed it first', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ phoneNeedsCode: true }) }) as unknown as typeof fetch;
        mockedRequest.mockResolvedValue({ ok: true, channel: 'sms' });
        render(createElement(UserInfoForm, { user: user(), isOnboarded: true }));

        fireEvent.click(screen.getByText('savePersonalInfo'));

        // The number rides the profile save, as it always did.
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(init.body as string).phone).toContain('6943472297');
        expect(await screen.findByText('sentTo +30 694 ··· 2297')).toBeInTheDocument();
    });
});
