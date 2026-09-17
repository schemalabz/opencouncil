/** @jest-environment jsdom */
import { act, render, screen } from '@testing-library/react';
import { useSignupFlow } from '../useSignupFlow';
import { draftKey, readDraft, writeDraft } from '../signup-draft';

jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

interface State {
    step: number;
    topics: string[];
    name: string;
}

const KEY = draftKey('notifications', 'athens');
const initial: State = { step: 1, topics: [], name: '' };

/** A flow in miniature: the same hook, the same draft contract. */
function Flow({ seeded = false, withDraft = true }: { seeded?: boolean; withDraft?: boolean }) {
    const flow = useSignupFlow<State>({
        initial: () => (seeded ? { step: 1, topics: ['saved'], name: 'Saved' } : initial),
        cityId: 'athens',
        signedIn: false,
        events: { stepViewed: 'step', failed: 'failed' },
        draft: withDraft
            ? {
                  key: KEY,
                  apply: (state, stored) => ({
                      ...state,
                      topics: stored.topics ?? state.topics,
                      name: stored.name ?? state.name,
                  }),
              }
            : undefined,
    });
    return (
        <div>
            <span data-testid="topics">{flow.state.topics.join(',')}</span>
            <span data-testid="name">{flow.state.name}</span>
            <button onClick={() => flow.patch({ name: 'typed' })}>edit</button>
        </div>
    );
}

beforeEach(() => window.localStorage.clear());

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

    it('does not restore over what the server already has', () => {
        writeDraft(KEY, { topics: ['stale'], name: 'Χθες' });
        // A reader editing a saved preference: the flow passes no draft, so
        // the server's answers stand.
        render(<Flow seeded withDraft={false} />);
        expect(screen.getByTestId('topics')).toHaveTextContent('saved');
        expect(screen.getByTestId('name')).toHaveTextContent('Saved');
    });
});
