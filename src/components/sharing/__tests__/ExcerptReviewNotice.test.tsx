import { useRef } from 'react';
import { webcrypto } from 'crypto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExcerptSelectionToolbar, EXCERPT_SHARE_EVENT } from '../ExcerptSelectionToolbar';

jest.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));
const mockTaskStatus = { humanReview: false };
const mockTag = { id: 'tag', personId: null };
const mockTranscript = [{ speakerTagId: 'tag', speakerTag: mockTag, utterances: [{ id: 'u1', text: 'Saved transcript text.', startTimestamp: 0, discussionSubjectId: null }] }];
jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({ useCouncilMeetingData: () => ({
    city: { id: 'city', name: 'Πόλη', name_en: 'City', timezone: 'Europe/Athens' },
    meeting: { id: 'meeting', name: 'Συνεδρίαση', name_en: 'Meeting', dateTime: new Date('2026-09-10') },
    subjects: [], transcript: mockTranscript, taskStatus: mockTaskStatus,
    getPerson: () => null, getSpeakerTag: () => mockTag, speakerTags: [mockTag],
}) }));

const writeText = jest.fn().mockResolvedValue(undefined);
const nativeShare = jest.fn().mockResolvedValue(undefined);
function Fixture({ editable = false }: { editable?: boolean }) {
    const rootRef = useRef<HTMLDivElement>(null);
    return <><div ref={rootRef} data-testid="transcript"><span data-utterance-id="u1">Saved transcript text.</span></div><ExcerptSelectionToolbar rootRef={rootRef} disabled={false} editable={editable} /></>;
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
});
