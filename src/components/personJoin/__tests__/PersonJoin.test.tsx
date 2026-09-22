import { createElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PersonJoin } from '../PersonJoin';
import { claimWithToken, sendJoinEmail } from '@/lib/actions/personJoin';
import { setVoicePrintConsent } from '@/lib/actions/personConsent';
import { captureEvent } from '@/lib/analytics/capture';
import type { JoinStage } from '@/lib/personJoin/stage';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
jest.mock('framer-motion', () => ({ useAnimate: () => [{ current: null }, jest.fn()], useReducedMotion: () => true }));
jest.mock('@/i18n/routing', () => ({
    // `onClick` and the rest pass through: TrackedLink captures its event there.
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
        createElement('a', { href, ...props }, children),
}));
jest.mock('@/components/signup/useCelebration', () => ({ useCelebration: jest.fn() }));
jest.mock('@/components/ImageOrInitials', () => ({ ImageOrInitials: () => null }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
jest.mock('@/lib/actions/personJoin', () => ({ claimWithToken: jest.fn(), sendJoinEmail: jest.fn() }));
jest.mock('@/lib/actions/personConsent', () => ({ setVoicePrintConsent: jest.fn() }));

const mockedClaim = claimWithToken as jest.MockedFunction<typeof claimWithToken>;
const mockedSend = sendJoinEmail as jest.MockedFunction<typeof sendJoinEmail>;
const mockedConsent = setVoicePrintConsent as jest.MockedFunction<typeof setVoicePrintConsent>;
const mockedCapture = captureEvent as jest.MockedFunction<typeof captureEvent>;

const person = { id: 'person-1', name: 'Αδάμ Μπούτζουκας', image: null, title: 'Αντιδήμαρχος', cityId: 'chania', cityName: 'Χανιά' };
const confirmStage = (signedIn: boolean): JoinStage =>
    signedIn ? { kind: 'confirm', signedIn: true, person, offerNotifications: true } : { kind: 'confirm', signedIn: false, person };
const linkHref = (text: string) => (screen.getByText(text).closest('a') as HTMLAnchorElement).getAttribute('href');
const flow = (stage: JoinStage, totalSteps: 2 | 3 = 3, finished = false) =>
    render(createElement(PersonJoin, { token: 'tok.en', stage, totalSteps, finished }));
const typeEmail = (value: string) => fireEvent.change(screen.getByLabelText('email.label'), { target: { value } });

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    window.scrollTo = jest.fn();
});

describe('PersonJoin, signed out', () => {
    it('walks from the name to the email to "check your email", and sends the normalised address', async () => {
        mockedSend.mockResolvedValue({ ok: true });
        flow(confirmStage(false));
        expect(screen.getByText('Αδάμ Μπούτζουκας')).toBeTruthy();
        expect(screen.getByText('stepOf 1 3')).toBeTruthy();

        fireEvent.click(screen.getByText('confirm.yes'));
        expect(screen.getByText('email.title')).toBeTruthy();
        expect(mockedClaim).not.toHaveBeenCalled();

        typeEmail('  Maria@Gmail.com ');
        fireEvent.click(screen.getByText('email.cta'));
        await waitFor(() => expect(screen.getByText('sent.title')).toBeTruthy());
        expect(mockedSend).toHaveBeenCalledWith('tok.en', 'maria@gmail.com');
        expect(screen.getByText('maria@gmail.com')).toBeTruthy();
    });

    it('stops a slip before it sends anything, and says why', async () => {
        flow(confirmStage(false));
        fireEvent.click(screen.getByText('confirm.yes'));
        typeEmail('maria@');
        fireEvent.click(screen.getByText('email.cta'));
        expect(await screen.findByText('email.invalid')).toBeTruthy();
        expect(mockedSend).not.toHaveBeenCalled();
    });

    it('offers the fix for a known slip in the domain', () => {
        flow(confirmStage(false));
        fireEvent.click(screen.getByText('confirm.yes'));
        typeEmail('maria@gmial.com');
        expect(screen.getByText('email.suggestion maria@gmail.com')).toBeTruthy();
        fireEvent.click(screen.getByText('email.useSuggestion'));
        expect((screen.getByLabelText('email.label') as HTMLInputElement).value).toBe('maria@gmail.com');
    });

    it('stays on the email step when the send fails, so the reader can try again', async () => {
        mockedSend.mockResolvedValue({ ok: false, error: 'send_failed' });
        flow(confirmStage(false));
        fireEvent.click(screen.getByText('confirm.yes'));
        typeEmail('maria@gmail.com');
        fireEvent.click(screen.getByText('email.cta'));
        expect(await screen.findByText('email.sendFailed')).toBeTruthy();
        expect(screen.getByText('email.title')).toBeTruthy();
    });

    it('lets a wrong address be changed, and holds the resend for a while', async () => {
        jest.useFakeTimers();
        mockedSend.mockResolvedValue({ ok: true });
        flow(confirmStage(false));
        fireEvent.click(screen.getByText('confirm.yes'));
        typeEmail('maria@gmail.com');
        fireEvent.click(screen.getByText('email.cta'));
        await waitFor(() => expect(screen.getByText('sent.title')).toBeTruthy());

        const resend = screen.getByText('sent.resendIn 30').closest('button') as HTMLButtonElement;
        expect(resend.disabled).toBe(true);
        for (let i = 0; i < 30; i++) act(() => { jest.advanceTimersByTime(1000); });
        fireEvent.click(screen.getByText('sent.resend'));
        await waitFor(() => expect(mockedSend).toHaveBeenCalledTimes(2));
        // The resend holds the buttons until it settles.
        expect(await screen.findByText('sent.resent')).toBeTruthy();

        fireEvent.click(screen.getByText('sent.change'));
        expect((screen.getByLabelText('email.label') as HTMLInputElement).value).toBe('maria@gmail.com');
        jest.useRealTimers();
    });

    it('says so when a resend fails, instead of leaving the reader waiting', async () => {
        jest.useFakeTimers();
        mockedSend.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: 'send_failed' });
        flow(confirmStage(false));
        fireEvent.click(screen.getByText('confirm.yes'));
        typeEmail('maria@gmail.com');
        fireEvent.click(screen.getByText('email.cta'));
        await waitFor(() => expect(screen.getByText('sent.title')).toBeTruthy());
        for (let i = 0; i < 30; i++) act(() => { jest.advanceTimersByTime(1000); });
        fireEvent.click(screen.getByText('sent.resend'));
        expect(await screen.findByText('email.sendFailed')).toBeTruthy();
        expect(screen.queryByText('sent.resent')).toBeNull();
        jest.useRealTimers();
    });

    it('has a way out for somebody who picked up the wrong strip, and a way back', () => {
        flow(confirmStage(false));
        fireEvent.click(screen.getByText('confirm.no'));
        expect(screen.getByText('notMe.title')).toBeTruthy();
        fireEvent.click(screen.getByText('notMe.back'));
        expect(screen.getByText('confirm.title')).toBeTruthy();
    });
});

describe('PersonJoin, signed in', () => {
    it('claims on "yes" and goes to the consent, in two steps', async () => {
        mockedClaim.mockResolvedValue('linked');
        flow(confirmStage(true), 2);
        fireEvent.click(screen.getByText('confirm.yes'));
        await waitFor(() => expect(screen.getByText('consent.title')).toBeTruthy());
        expect(mockedClaim).toHaveBeenCalledWith('tok.en');
        // A reload must stay on the consent, not read as a fresh scan of a spent code.
        expect(new URL(window.location.href).searchParams.get('step')).toBe('2');
        expect(screen.getByText('stepOf 2 2')).toBeTruthy();
    });

    it('skips the consent question when a consent is already in force', async () => {
        mockedClaim.mockResolvedValue('consented');
        flow(confirmStage(true), 2);
        fireEvent.click(screen.getByText('confirm.yes'));
        await waitFor(() => expect(screen.getByText('done.title')).toBeTruthy());
        expect(screen.queryByText('consent.title')).toBeNull();
        expect(mockedConsent).not.toHaveBeenCalled();
    });

    it('asks for the email when the session ended in the meantime', async () => {
        mockedClaim.mockResolvedValue('signed_out');
        flow(confirmStage(true), 2);
        fireEvent.click(screen.getByText('confirm.yes'));
        await waitFor(() => expect(screen.getByText('email.title')).toBeTruthy());
        expect(screen.getByText('stepOf 2 3')).toBeTruthy();
    });

    it('says the code was used when another account won in the meantime', async () => {
        mockedClaim.mockResolvedValue('already_linked');
        flow(confirmStage(true), 2);
        fireEvent.click(screen.getByText('confirm.yes'));
        expect(await screen.findByText('problem.usedTitle')).toBeTruthy();
        expect(screen.getByText('problem.used Αδάμ Μπούτζουκας')).toBeTruthy();
    });

    it('stays on the name when the claim throws, and says so', async () => {
        mockedClaim.mockRejectedValue(new Error('down'));
        flow(confirmStage(true), 2);
        fireEvent.click(screen.getByText('confirm.yes'));
        expect(await screen.findByText('confirm.error')).toBeTruthy();
    });
});

describe('PersonJoin, the consent step', () => {
    const consentStage: JoinStage = { kind: 'consent', consented: false, person, offerNotifications: true };

    it('cannot finish before an answer, records a yes, and ends on the done screen', async () => {
        mockedConsent.mockResolvedValue(undefined);
        flow(consentStage);
        expect(screen.getByText('stepOf 3 3')).toBeTruthy();
        const finish = screen.getByText('consent.cta').closest('button') as HTMLButtonElement;
        expect(finish.disabled).toBe(true);

        fireEvent.click(screen.getByText('consent.yes'));
        fireEvent.click(finish);
        await waitFor(() => expect(screen.getByText('done.title')).toBeTruthy());
        expect(mockedConsent).toHaveBeenCalledWith('person-1', true);
    });

    it('finishes on "not now" without writing anything', async () => {
        flow(consentStage);
        fireEvent.click(screen.getByText('consent.no'));
        fireEvent.click(screen.getByText('consent.cta'));
        await waitFor(() => expect(screen.getByText('done.title')).toBeTruthy());
        expect(mockedConsent).not.toHaveBeenCalled();
    });

    it('stays on the step when the consent does not save', async () => {
        mockedConsent.mockRejectedValue(new Error('down'));
        flow(consentStage);
        fireEvent.click(screen.getByText('consent.yes'));
        fireEvent.click(screen.getByText('consent.cta'));
        expect(await screen.findByText('consent.error')).toBeTruthy();
        expect(screen.queryByText('done.title')).toBeNull();
    });

    it('opens on the done screen for somebody who already answered yes', () => {
        flow({ kind: 'consent', consented: true, person, offerNotifications: true });
        expect(screen.getByText('done.title')).toBeTruthy();
    });
});

describe('PersonJoin, the done screen', () => {
    it('invites the reader to their city\'s notifications, ahead of their page', async () => {
        flow({ kind: 'consent', consented: false, person, offerNotifications: true });
        fireEvent.click(screen.getByText('consent.no'));
        fireEvent.click(screen.getByText('consent.cta'));
        await waitFor(() => expect(screen.getByText('done.title')).toBeTruthy());
        expect(screen.getByText('done.notifyTitle')).toBeTruthy();
        // Step 2, not the explainer: the card has already made the case.
        expect(linkHref('done.notifyCta')).toBe('/chania/notifications?step=2');
        expect(linkHref('done.page')).toBe('/chania/people/person-1');
        expect(linkHref('done.profile')).toBe('/profile');
    });

    it('counts a press of the invitation', async () => {
        flow({ kind: 'consent', consented: true, person, offerNotifications: true });
        fireEvent.click(screen.getByText('done.notifyCta'));
        expect(mockedCapture).toHaveBeenCalledWith('person_join_notifications_clicked', { city_id: 'chania' });
    });

    it('marks the tab as finished, so a Back does not re-ask the consent', async () => {
        flow({ kind: 'consent', consented: false, person, offerNotifications: true });
        fireEvent.click(screen.getByText('consent.no'));
        fireEvent.click(screen.getByText('consent.cta'));
        await waitFor(() => expect(screen.getByText('done.title')).toBeTruthy());
        expect(new URL(window.location.href).searchParams.get('step')).toBe('done');
    });

    it('opens on the done screen for a reader who came back to a finished flow', () => {
        flow({ kind: 'consent', consented: false, person, offerNotifications: true }, 3, true);
        expect(screen.getByText('done.title')).toBeTruthy();
        expect(screen.queryByText('consent.title')).toBeNull();
    });

    it('carries the invitation through a claim made in this tab', async () => {
        mockedClaim.mockResolvedValue('consented');
        flow(confirmStage(true), 2);
        fireEvent.click(screen.getByText('confirm.yes'));
        await waitFor(() => expect(screen.getByText('done.title')).toBeTruthy());
        expect(linkHref('done.notifyCta')).toBe('/chania/notifications?step=2');
    });

    it('keeps their page as the way out when there are no notifications to offer', () => {
        flow({ kind: 'consent', consented: true, person, offerNotifications: false });
        expect(screen.getByText('done.title')).toBeTruthy();
        expect(screen.queryByText('done.notifyCta')).toBeNull();
        expect(linkHref('done.page')).toBe('/chania/people/person-1');
    });
});

describe('PersonJoin, codes that cannot go on', () => {
    it('says a bad code does not work', () => {
        flow({ kind: 'invalid' });
        expect(screen.getByText('problem.invalidTitle')).toBeTruthy();
    });

    it('says the code is no longer valid once the person has an account, with a quiet sign-in when signed out', () => {
        flow({ kind: 'used', signedIn: false, own: false, person });
        expect(screen.getByText('problem.usedTitle')).toBeTruthy();
        expect(screen.getByText('problem.used Αδάμ Μπούτζουκας')).toBeTruthy();
        const href = (screen.getByText('problem.signIn').closest('a') as HTMLAnchorElement).getAttribute('href');
        expect(href).toBe('/sign-in');
    });

    it('says the same to another signed-in account, with no sign-in to offer', () => {
        flow({ kind: 'used', signedIn: true, own: false, person });
        expect(screen.getByText('problem.usedTitle')).toBeTruthy();
        expect(screen.queryByText('problem.signIn')).toBeNull();
        expect(screen.getByText('problem.usedHelp')).toBeTruthy();
    });

    it('sends the owner of a spent code to their profile instead of the team', () => {
        flow({ kind: 'used', signedIn: true, own: true, person });
        expect(screen.getByText('problem.usedTitle')).toBeTruthy();
        expect(screen.queryByText('problem.usedHelp')).toBeNull();
        expect((screen.getByText('done.profile').closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('/profile');
    });
});
