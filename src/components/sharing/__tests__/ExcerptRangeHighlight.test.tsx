import { createRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { ExcerptRangeHighlight, useExcerptHighlighted } from '../ExcerptRangeHighlight';
import { digestExcerpt, serializeExcerptSelector, type ExcerptSource } from '@/lib/sharing/excerptSelector';

let query = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => query }));
const source: ExcerptSource = { id: 'u1', text: 'Πριν απόσπασμα μετά', speakerTagId: 'tag', personId: null, speakerName: null, startTimestamp: 0 };
function MarkedSource() {
    const highlighted = useExcerptHighlighted(source.id);
    return <span data-utterance-id={source.id}>{highlighted ? <mark>{source.text}</mark> : source.text}</span>;
}
function Fixture({ text = source.text }: { text?: string }) {
    const rootRef = createRef<HTMLDivElement>();
    return <ExcerptRangeHighlight rootRef={rootRef} sources={[{ ...source, text }]}><div ref={rootRef}><MarkedSource /></div></ExcerptRangeHighlight>;
}

describe('recipient transcript range', () => {
    beforeAll(() => {
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
        HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    beforeEach(async () => {
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
});
