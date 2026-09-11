import { useRef } from 'react';
import { webcrypto } from 'crypto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExcerptSelectionToolbar, EXCERPT_SHARE_EVENT } from '../ExcerptSelectionToolbar';
import { SegmentShareButton } from '../SegmentShareButton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { digestExcerpt } from '@/lib/sharing/excerptSelector';

jest.mock('@/components/meetings/options/OptionsContext', () => ({ useTranscriptOptions: () => ({ options: { maxUtteranceDrift: 500 } }) }));

jest.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
const mockTaskStatus = { humanReview: false };
const mockTag = { id: 'tag', personId: null };
const mockTranscript = ['Saved transcript text.', 'The rest of the same speaker turn.', 'A neighboring turn.'].map((text, index) => ({
    speakerTagId: 'tag', speakerTag: mockTag, utterances: [{ id: `u${index + 1}`, text, startTimestamp: index * 10, discussionSubjectId: null }],
}));
jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({ useCouncilMeetingData: () => ({
    city: { id: 'city', name: 'Πόλη', name_en: 'City', timezone: 'Europe/Athens' },
    meeting: { id: 'meeting', name: 'Συνεδρίαση', name_en: 'Meeting', dateTime: new Date('2026-09-10') },
    subjects: [], transcript: mockTranscript, taskStatus: mockTaskStatus,
    getPerson: () => null, getSpeakerTag: () => mockTag, speakerTags: [mockTag],
}) }));

const writeText = jest.fn().mockResolvedValue(undefined);
const nativeShare = jest.fn().mockResolvedValue(undefined);
function Fixture({ editable = false, disabled = false, missingPassage = false }: { editable?: boolean; disabled?: boolean; missingPassage?: boolean }) {
    const rootRef = useRef<HTMLDivElement>(null);
    return <TooltipProvider><div ref={rootRef} data-excerpt-root data-testid="transcript">
        {mockTranscript.flatMap(segment => segment.utterances).filter(utterance => !missingPassage || utterance.id !== 'u2').map(utterance => <span key={utterance.id} data-utterance-id={utterance.id}>{utterance.text}</span>)}
        <SegmentShareButton utteranceIds={['u1', 'u2']} />
    </div><ExcerptSelectionToolbar rootRef={rootRef} disabled={disabled} editable={editable} /></TooltipProvider>;
}
async function openExcerpt() {
    fireEvent(screen.getByTestId('transcript'), new CustomEvent(EXCERPT_SHARE_EVENT, { detail: { range: null, utteranceId: 'u1' } }));
    await screen.findByRole('dialog');
}

describe('excerpt review disclosure', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTaskStatus.humanReview = false;
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        Object.defineProperty(navigator, 'share', { configurable: true, value: nativeShare });
    });
    it.each([false, true])('shows and shares the warning for saved text with editable=%s', async editable => {
        render(<Fixture editable={editable} />);
        await openExcerpt();
        expect(screen.getByRole('note')).toHaveTextContent('unreviewedNotice');
        fireEvent.click(screen.getByRole('button', { name: 'copyQuote' }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        expect(writeText.mock.calls[0][0]).toMatch(/^unreviewedNotice\n\n«Saved transcript text\.»/);
        await waitFor(() => expect(screen.getByRole('button', { name: 'share' })).not.toBeDisabled());
        fireEvent.click(screen.getByRole('button', { name: 'share' }));
        await waitFor(() => expect(nativeShare).toHaveBeenCalled());
        expect(nativeShare.mock.calls[0][0].text).toMatch(/^unreviewedNotice\n\n/);
    });
    it('omits the notice and copied warning after human review', async () => {
        mockTaskStatus.humanReview = true;
        render(<Fixture />);
        await openExcerpt();
        expect(screen.queryByRole('note')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'copyQuote' }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        expect(writeText.mock.calls[0][0]).not.toContain('unreviewedNotice');
        expect(writeText.mock.calls[0][0]).toContain('«Saved transcript text.»');
    });

    it('shares a joined speaker turn with the correct digest, review warning and saved-edit disclosure', async () => {
        const { container } = render(<Fixture editable />);
        const range = document.createRange();
        range.selectNodeContents(container.querySelector('[data-utterance-id="u3"]')!);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);

        fireEvent.click(screen.getByRole('button', { name: 'shareSegment' }));
        const dialog = await screen.findByRole('dialog', { name: 'shareSegment' });
        expect(dialog).toHaveTextContent('Saved transcript text.');
        expect(dialog).toHaveTextContent('The rest of the same speaker turn.');
        expect(dialog).not.toHaveTextContent('A neighboring turn.');
        expect(dialog).toHaveTextContent('savedTextOnly');
        expect(screen.getByRole('note')).toHaveTextContent('unreviewedNotice');
        expect(screen.getByRole('button', { name: 'storyTitle' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'copyLink' }));
        await waitFor(() => expect(writeText).toHaveBeenCalled());
        const url = new URL(writeText.mock.calls[0][0]);
        expect(url.searchParams.get('firstUtteranceId')).toBe('u1');
        expect(url.searchParams.get('lastUtteranceId')).toBe('u2');
        expect(url.searchParams.get('digest')).toBe(await digestExcerpt(mockTranscript.slice(0, 2).flatMap(segment => segment.utterances).map(utterance => ({
            id: utterance.id, text: utterance.text, speakerTagId: 'tag', personId: null, speakerName: null,
        }))));
        window.getSelection()!.removeAllRanges();
    });

    it('explains when a complete turn cannot be shared instead of omitting a passage', async () => {
        render(<Fixture missingPassage editable />);
        fireEvent.click(screen.getByRole('button', { name: 'shareSegment' }));
        expect(await screen.findByRole('status')).toHaveTextContent('segmentUnavailable');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not open segment sharing when transcript sharing is disabled', () => {
        render(<Fixture disabled />);
        fireEvent.click(screen.getByRole('button', { name: 'shareSegment' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(writeText).not.toHaveBeenCalled();
    });
});
