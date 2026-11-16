import { render, screen, fireEvent, act } from '@testing-library/react';
import { replaceAllInUtterances } from '@/lib/actions/utterances';
import { FindReplacePanel } from '../FindReplacePanel';

const mockFr = {
    isOpen: true,
    pendingFocus: null,
    clearPendingFocus: jest.fn(),
    close: jest.fn(),
    searchTerm: 'foo',
    replaceTerm: 'bar',
    caseSensitive: false,
    matches: [{ utteranceId: 'u-1', segmentId: 's-1', start: 0, end: 3, globalIndex: 0 }],
    currentMatchIndex: 0,
    setSearchTerm: jest.fn(),
    setReplaceTerm: jest.fn(),
    setCaseSensitive: jest.fn(),
    nextMatch: jest.fn(),
    prevMatch: jest.fn(),
};

jest.mock('../FindReplaceContext', () => ({ useFindReplace: () => mockFr }));
const mockUpdateUtterance = jest.fn();
const mockTranscript = [{
    id: 's-1',
    utterances: [{ id: 'u-1', text: 'foo one' }, { id: 'u-2', text: 'foo two' }],
}];
jest.mock('../../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({ meeting: { id: 'm-1', cityId: 'c-1' }, transcript: mockTranscript }),
    useCouncilMeetingActions: () => ({ updateUtterance: mockUpdateUtterance }),
}));
jest.mock('../../options/OptionsContext', () => ({ useTranscriptOptions: () => ({ options: { editable: true } }) }));
jest.mock('@/lib/actions/utterances', () => ({ editUtterance: jest.fn(), replaceAllInUtterances: jest.fn() }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

beforeEach(() => {
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = jest.fn();
});

describe('FindReplacePanel Enter key', () => {
    it('moves to the next match when Enter is pressed in the search input', () => {
        render(<FindReplacePanel />);
        const notPrevented = fireEvent.keyDown(screen.getByPlaceholderText('searchPlaceholder'), { key: 'Enter' });
        expect(notPrevented).toBe(false);
        expect(mockFr.nextMatch).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['replaceOne', () => screen.getByText('replaceOne')],
        ['replaceAll', () => screen.getByText('replaceAll')],
        ['previous', () => screen.getByTitle('previous')],
        ['close', () => screen.getByTitle('close')],
    ])('leaves Enter to the focused %s button', (_name, getButton) => {
        render(<FindReplacePanel />);
        const notPrevented = fireEvent.keyDown(getButton(), { key: 'Enter' });
        expect(notPrevented).toBe(true);
        expect(mockFr.nextMatch).not.toHaveBeenCalled();
    });
});

describe('FindReplacePanel Replace All', () => {
    it('changes only the utterances the server wrote, with the text it wrote', async () => {
        // u-1 was saved by another editor in between, so the server skipped it.
        (replaceAllInUtterances as jest.Mock).mockResolvedValue({
            utteranceCount: 1, occurrenceCount: 1, updated: [{ id: 'u-2', text: 'bar two' }],
        });
        render(<FindReplacePanel />);

        fireEvent.click(screen.getByText('replaceAll'));
        await act(async () => {
            fireEvent.click(screen.getByText('confirmReplace'));
        });

        expect(mockUpdateUtterance).toHaveBeenCalledTimes(1);
        expect(mockUpdateUtterance).toHaveBeenCalledWith('s-1', 'u-2', { text: 'bar two', lastModifiedBy: 'user' });
    });
});
