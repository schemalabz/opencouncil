/** @jest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import { useSignupFlow } from '../useSignupFlow';
import { draftKey, readDraft, stashPhoneForGoogleReturn, takePhoneFromGoogleReturn, writeDraft } from '../signup-draft';

jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

interface State {
    step: number;
    topics: string[];
    name: string;
    email: string;
    phone: string;
}

const KEY = draftKey('notifications', 'athens');
const initial: State = { step: 1, topics: [], name: '', email: '', phone: '' };

/** A flow in miniature: the same hook, the same draft contract. */
function Flow({
    seeded = false,
    withDraft = true,
    account = null,
}: {
    seeded?: boolean;
    withDraft?: boolean;
    account?: { phone: string | null } | null;
}) {
    const flow = useSignupFlow<State>({
        initial: () => (seeded ? { ...initial, topics: ['saved'], name: 'Saved' } : initial),
        cityId: 'athens',
        signedIn: account !== null,
        events: { stepViewed: 'step', failed: 'failed' },
        draft: withDraft
            ? {
                  flow: 'notifications',
                  account,
                  apply: (state, stored) => ({ ...state, topics: stored.topics ?? state.topics }),
              }
            : undefined,
    });
    return (
        <div>
            <span data-testid="topics">{flow.state.topics.join(',')}</span>
            <span data-testid="name">{flow.state.name}</span>
            <span data-testid="phone">{flow.state.phone}</span>
            <button onClick={() => flow.patch({ name: 'typed', phone: '6912345678' })}>edit</button>
            <button onClick={flow.stashPhoneForGoogle}>google</button>
        </div>
    );
}

beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
});

describe('the flow and its draft', () => {
    it('puts a kept draft back on the form', () => {
        writeDraft(KEY, { topics: ['t1'], name: 'Μαρία' });
        render(<Flow />);
        expect(screen.getByTestId('topics')).toHaveTextContent('t1');
        expect(screen.getByTestId('name')).toHaveTextContent('Μαρία');
    });

    it('never writes over the draft it just read', () => {
        writeDraft(KEY, { topics: ['t1'], name: 'Μαρία' });
        render(<Flow />);
        // The write effect must not run in the restore's own commit with the
        // pre-restore form — that would replace the draft with an empty one.
        expect(readDraft<Partial<State>>(KEY)).toMatchObject({ topics: ['t1'], name: 'Μαρία' });
    });

    it('leaves nothing behind for a visitor who types nothing', () => {
        render(<Flow />);
        expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it('keeps the form from the reader\'s first edit', () => {
        render(<Flow />);
        act(() => screen.getByText('edit').click());
        expect(readDraft<Partial<State>>(KEY)).toMatchObject({ name: 'typed' });
    });

    it('puts the account fields back for a visitor, and never for a signed-in reader', () => {
        writeDraft(KEY, { name: 'Μαρία', email: 'maria@example.com', phone: '6900000000' });
        const { unmount } = render(<Flow />);
        expect(screen.getByTestId('name')).toHaveTextContent('Μαρία');
        expect(screen.getByTestId('phone')).toHaveTextContent('6900000000');
        unmount();

        render(<Flow account={{ phone: '6911111111' }} />);
        expect(screen.getByTestId('name')).toHaveTextContent('');
        expect(screen.getByTestId('phone')).toHaveTextContent('');
    });

    it('gives a signed-in reader without a phone the one this tab took to Google, once', () => {
        writeDraft(KEY, { phone: '6900000000' });
        stashPhoneForGoogleReturn(KEY, '6912345678');
        render(<Flow account={{ phone: null }} />);
        expect(screen.getByTestId('phone')).toHaveTextContent('6912345678');
        expect(takePhoneFromGoogleReturn(KEY)).toBeNull();
    });

    it('leaves the phone of an account that has one, and still spends the stash', () => {
        stashPhoneForGoogleReturn(KEY, '6912345678');
        render(<Flow account={{ phone: '6911111111' }} />);
        expect(screen.getByTestId('phone')).toHaveTextContent('');
        expect(takePhoneFromGoogleReturn(KEY)).toBeNull();
    });

    it('stashes the phone in the form for the trip to Google', () => {
        render(<Flow />);
        act(() => screen.getByText('edit').click());
        act(() => screen.getByText('google').click());
        expect(takePhoneFromGoogleReturn(KEY)).toBe('6912345678');
    });

    it('does not restore over what the server already has', () => {
        writeDraft(KEY, { topics: ['stale'], name: 'Χθες' });
        // A reader editing a saved preference: the flow passes no draft, so
        // the server's answers stand.
        render(<Flow seeded withDraft={false} />);
        expect(screen.getByTestId('topics')).toHaveTextContent('saved');
        expect(screen.getByTestId('name')).toHaveTextContent('Saved');
    });
});
