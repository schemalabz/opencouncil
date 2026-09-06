import { createElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotisSwitch } from '../NotisSwitch';
import { getNotisChannelState, setNotisEnabled, type NotisChannelState } from '@/lib/actions/notis';
import { captureEvent } from '@/lib/analytics/capture';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: { alt: string }) => createElement('img', { alt: props.alt }),
}));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children }: { href: string; children: React.ReactNode }) => createElement('a', { href }, children),
}));
jest.mock('@/lib/actions/notis', () => ({
    getNotisChannelState: jest.fn(),
    setNotisEnabled: jest.fn(),
}));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

const mockedState = getNotisChannelState as jest.MockedFunction<typeof getNotisChannelState>;
const mockedSet = setNotisEnabled as jest.MockedFunction<typeof setNotisEnabled>;

const active = {
    status: 'active' as const,
    phone: '+306943472297',
    origin: 'signup',
    unsubscribedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
};

function state(overrides: Partial<NotisChannelState> = {}): NotisChannelState {
    return {
        configured: true,
        reachable: true,
        subscription: active,
        notifyByPhone: true,
        phone: '+306943472297',
        ...overrides,
    };
}

const theSwitch = () => screen.getByRole('switch');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('NotisSwitch', () => {
    it('reads its state from Notis and names the number he writes to', async () => {
        mockedState.mockResolvedValue(state());
        render(<NotisSwitch hasPreferences />);

        await waitFor(() => expect(theSwitch()).toHaveAttribute('aria-checked', 'true'));
        expect(theSwitch()).toBeEnabled();
        expect(screen.getByText('notisOn +30 694 ··· 2297')).toBeInTheDocument();
    });

    it('shows what Notis says over the request: a reader who said ΣΤΟΠ reads as off', async () => {
        mockedState.mockResolvedValue(
            state({ subscription: { ...active, status: 'unsubscribed', unsubscribedAt: '2026-09-05T10:00:00.000Z' } }),
        );
        render(<NotisSwitch hasPreferences />);

        await waitFor(() => expect(theSwitch()).toHaveAttribute('aria-checked', 'false'));
        expect(screen.getByText('notisOff')).toBeInTheDocument();
    });

    it('turns Νότης off through the action and reports the flip', async () => {
        mockedState.mockResolvedValue(state());
        mockedSet.mockResolvedValue({
            ok: true,
            enabled: false,
            subscription: { ...active, status: 'unsubscribed', unsubscribedAt: '2026-09-06T10:00:00.000Z' },
        });
        render(<NotisSwitch hasPreferences />);
        await waitFor(() => expect(theSwitch()).toBeEnabled());

        fireEvent.click(theSwitch());

        await waitFor(() => expect(theSwitch()).toHaveAttribute('aria-checked', 'false'));
        expect(mockedSet).toHaveBeenCalledWith(false);
        expect(screen.getByText('notisOff')).toBeInTheDocument();
        expect(captureEvent).toHaveBeenCalledWith('notis_toggle_changed', {
            enabled: false,
            had_subscription: true,
        });
    });

    it('keeps its state when Notis did not confirm the flip, and offers the same flip again', async () => {
        mockedState.mockResolvedValue(state());
        mockedSet.mockResolvedValueOnce({ ok: false, code: 'notis_unreachable' });
        mockedSet.mockResolvedValueOnce({ ok: true, enabled: false, subscription: null });
        render(<NotisSwitch hasPreferences />);
        await waitFor(() => expect(theSwitch()).toBeEnabled());

        fireEvent.click(theSwitch());
        await screen.findByText(/notisUnreachable/);
        expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
        expect(captureEvent).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'notisRetry' }));

        await waitFor(() => expect(theSwitch()).toHaveAttribute('aria-checked', 'false'));
        expect(mockedSet).toHaveBeenLastCalledWith(false);
        expect(mockedSet).toHaveBeenCalledTimes(2);
    });

    it('promises the first message while enrollment is still pending', async () => {
        mockedState.mockResolvedValue(state({ subscription: null, notifyByPhone: false }));
        mockedSet.mockResolvedValue({ ok: true, enabled: true, subscription: null });
        render(<NotisSwitch hasPreferences />);
        await waitFor(() => expect(theSwitch()).toHaveAttribute('aria-checked', 'false'));

        fireEvent.click(theSwitch());

        await screen.findByText('notisPending +30 694 ··· 2297');
        expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
    });

    it('shows the refusal when Notis will not take the number', async () => {
        mockedState.mockResolvedValue(state({ subscription: null, notifyByPhone: false }));
        mockedSet.mockResolvedValue({ ok: false, code: 'phone_in_use' });
        render(<NotisSwitch hasPreferences />);
        await waitFor(() => expect(theSwitch()).toBeEnabled());

        fireEvent.click(theSwitch());

        await screen.findByText('phoneInUse');
        expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
    });

    it('is locked without a mobile number and points at the personal tab', async () => {
        mockedState.mockResolvedValue(state({ subscription: null, notifyByPhone: false, phone: null }));
        render(<NotisSwitch hasPreferences />);

        await waitFor(() => expect(theSwitch()).toBeDisabled());
        expect(screen.getByRole('link', { name: 'notisAddPhone' })).toHaveAttribute('href', '/profile?tab=personal');
    });

    it('freezes on the request instead of showing OFF while Notis is unreachable', async () => {
        mockedState.mockResolvedValueOnce(state({ reachable: false, subscription: null }));
        mockedState.mockResolvedValueOnce(state());
        render(<NotisSwitch hasPreferences />);

        await waitFor(() => expect(theSwitch()).toBeDisabled());
        expect(theSwitch()).toHaveAttribute('aria-checked', 'true');

        fireEvent.click(screen.getByRole('button', { name: 'notisRetry' }));

        await waitFor(() => expect(theSwitch()).toBeEnabled());
        expect(mockedState).toHaveBeenCalledTimes(2);
    });

    it('stays hidden for a reader with no preferences and no subscription', async () => {
        mockedState.mockResolvedValue(state({ subscription: null, notifyByPhone: false }));
        const { container } = render(<NotisSwitch hasPreferences={false} />);

        await waitFor(() => expect(mockedState).toHaveBeenCalled());
        expect(container).toBeEmptyDOMElement();
    });
});
