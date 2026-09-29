import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'crypto';
import { ExcerptRangeHighlight, useExcerptHighlighted } from '../ExcerptRangeHighlight';
import { digestExcerpt, serializeExcerptSelector, type ExcerptSource } from '@/lib/sharing/excerptSelector';
import { captureEvent } from '@/lib/analytics/capture';
import { toast } from '@/hooks/use-toast';
import type { PassageUtterance } from '@/lib/sharing/passageSubject';

let query = new URLSearchParams();
const mockSeek = jest.fn();
let renders = 0;
const mockMeeting = { cityId: 'city', id: 'meeting' };
const assignedTranscript: { utterances: PassageUtterance[] }[] = [{ utterances: [{ id: 'u1', startTimestamp: 12.8, discussionSubjectId: 'square', discussionStatus: null, drift: 0 }] }];
let mockTranscript = assignedTranscript;
jest.mock('next/navigation', () => ({ useSearchParams: () => query }));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/components/meetings/VideoProvider', () => ({ useVideoActions: () => ({ seekToWithoutScroll: mockSeek }) }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({ useCouncilMeetingData: () => ({
    meeting: mockMeeting, subjects: [{ id: 'square' }, { id: 'far' }], taskStatus: { humanReview: false }, transcript: mockTranscript,
}) }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
const source: ExcerptSource = { id: 'u1', text: 'Πριν απόσπασμα μετά', speakerTagId: 'tag', personId: null, speakerName: null, startTimestamp: 12.8 };
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
const nextFrame = () => act(() => new Promise(resolve => requestAnimationFrame(resolve)));

describe('recipient transcript range', () => {
    beforeAll(() => {
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
        HTMLElement.prototype.scrollIntoView = jest.fn();
    });
    beforeEach(async () => {
        jest.clearAllMocks();
        renders = 0;
        mockMeeting.id = 'meeting';
        mockTranscript = assignedTranscript;
        query = serializeExcerptSelector({ cityId: 'city', meetingId: 'meeting', firstUtteranceId: 'u1', lastUtteranceId: 'u1', textLocale: 'el', digest: await digestExcerpt([source]) });
    });
    it('highlights the complete saved utterance after verifying the source digest', async () => {
        const { container } = render(<Fixture />);
        await waitFor(() => expect(container.querySelector('mark')?.textContent).toBe(source.text));
        expect(screen.getByText(/Πριν/).textContent).toBe(source.text);
    });
    it('keeps the place of a corrected excerpt, says that it changed and does not highlight it', async () => {
        const { container } = render(<Fixture text="Πριν διαφορετικά μετά" />);
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'sourceChangedTitle', description: 'sourceChangedInTranscript' }));
        expect(container.querySelector('mark')).toBeNull();
        expect(mockSeek).toHaveBeenCalledWith(12.8);
        expect(captureEvent).not.toHaveBeenCalled();
    });
    it('ignores an excerpt of another meeting', async () => {
        mockMeeting.id = 'other';
        const { container } = render(<Fixture />);
        await nextFrame();
        await nextFrame();
        expect(container.querySelector('mark')).toBeNull();
        expect(toast).not.toHaveBeenCalled();
        expect(mockSeek).not.toHaveBeenCalled();
    });
    it('lands on the excerpt start once, with focus, however often the transcript re-renders', async () => {
        const { container, rerender } = render(<Fixture />);
        await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
        expect(mockSeek).toHaveBeenCalledWith(12.8);
        expect(document.activeElement).toBe(container.querySelector('[data-utterance-id="u1"]'));
        const settled = renders;
        rerender(<Fixture />);
        await nextFrame();
        await nextFrame();
        expect(container.querySelector('mark')).not.toBeNull();
        expect(renders).toBe(settled);
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
        expect(mockSeek).toHaveBeenCalledTimes(1);
        expect(toast).not.toHaveBeenCalled();
        expect(captureEvent).toHaveBeenCalledTimes(1);
        expect(captureEvent).toHaveBeenCalledWith('sharing_received', expect.objectContaining({ content_type: 'excerpt', surface: 'transcript', city_id: 'city', meeting_id: 'meeting', subject_id: 'square', reviewed: false, utterance_count: 1 }));
    });
    it('names the subject of the link preview, without borrowing past the drift filter', async () => {
        mockTranscript = [{ utterances: [
            { id: 'u0', startTimestamp: 5, discussionSubjectId: 'far', discussionStatus: null, drift: 100 },
            { id: 'u1', startTimestamp: 12.8, discussionSubjectId: null, discussionStatus: null, drift: 0 },
        ] }];
        query = serializeExcerptSelector({ cityId: 'city', meetingId: 'meeting', firstUtteranceId: 'u1', lastUtteranceId: 'u1', textLocale: 'el', maxDrift: 50, digest: await digestExcerpt([source]) });
        render(<Fixture />);
        await waitFor(() => expect(captureEvent).toHaveBeenCalled());
        expect((captureEvent as jest.Mock).mock.calls[0][1]).toMatchObject({ subject_id: undefined, reviewed: false });
    });
});
