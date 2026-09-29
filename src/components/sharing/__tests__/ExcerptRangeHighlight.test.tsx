import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { ExcerptRangeHighlight, useExcerptHighlighted } from '../ExcerptRangeHighlight';
import { digestExcerpt, serializeExcerptSelector, type ExcerptSource } from '@/lib/sharing/excerptSelector';

let query = new URLSearchParams();
let renders = 0;
jest.mock('next/navigation', () => ({ useSearchParams: () => query }));
const source: ExcerptSource = { id: 'u1', text: 'Πριν απόσπασμα μετά', speakerTagId: 'tag', personId: null, speakerName: null, startTimestamp: 0 };
function MarkedSource() {
    const highlighted = useExcerptHighlighted(source.id);
    renders += 1;
    return <span data-utterance-id={source.id}>{highlighted ? <mark>{source.text}</mark> : source.text}</span>;
}
// Created once: an utterance that re-renders only when its context changes, as the memoized transcript does.
const marked = <MarkedSource />;
function Fixture({ text = source.text }: { text?: string }) {
    const rootRef = createRef<HTMLDivElement>();
    return <ExcerptRangeHighlight rootRef={rootRef} sources={[{ ...source, text }]}><div ref={rootRef}>{marked}</div></ExcerptRangeHighlight>;
}

describe('recipient transcript range', () => {
    beforeAll(() => {
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
        HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    beforeEach(async () => {
        jest.clearAllMocks();
        renders = 0;
        query = serializeExcerptSelector({ cityId: 'city', meetingId: 'meeting', firstUtteranceId: 'u1', lastUtteranceId: 'u1', textLocale: 'el', digest: await digestExcerpt([source]) });
    });
    it('highlights the complete saved utterance after verifying the source digest', async () => {
        const { container } = render(<Fixture />);
        await waitFor(() => expect(container.querySelector('mark')?.textContent).toBe(source.text));
        expect(screen.getByText(/Πριν/).textContent).toBe(source.text);
    });
    it('does not highlight corrected source words from an old digest', async () => {
        const { container } = render(<Fixture text="Πριν διαφορετικά μετά" />);
        await waitFor(() => expect(screen.getByText(source.text)).toBeInTheDocument());
        expect(container.querySelector('mark')).toBeNull();
    });
    it('lands on the excerpt once and keeps its highlight, however often the transcript re-renders', async () => {
        const { container, rerender } = render(<Fixture />);
        await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
        const settled = renders;
        rerender(<Fixture />);
        await act(() => new Promise(resolve => requestAnimationFrame(resolve)));
        await act(() => new Promise(resolve => requestAnimationFrame(resolve)));
        expect(container.querySelector('mark')).not.toBeNull();
        expect(renders).toBe(settled);
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });
});
