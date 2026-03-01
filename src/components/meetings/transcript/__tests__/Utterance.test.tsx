import { Utterance } from '@prisma/client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import UtteranceC from '../Utterance';

const mockSeekTo = jest.fn();
const mockTogglePlayPause = jest.fn();
const mockSaveUtteranceChanges = jest.fn();
const mockPushAction = jest.fn();
const mockToast = jest.fn();

jest.mock('../../VideoProvider', () => ({
    useVideo: () => ({
        currentTime: 0,
        seekTo: mockSeekTo,
        togglePlayPause: mockTogglePlayPause
    })
}));

jest.mock('../../options/OptionsContext', () => ({
    useTranscriptOptions: () => ({
        options: {
            editable: true,
            canCreateHighlights: false,
            maxUtteranceDrift: 9999,
            skipInterval: 5
        }
    })
}));

jest.mock('../../HighlightContext', () => ({
    useHighlight: () => ({
        editingHighlight: null,
        updateHighlightUtterances: jest.fn(),
        createHighlight: jest.fn()
    })
}));

jest.mock('../../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({
        moveUtterancesToPrevious: jest.fn(),
        moveUtterancesToNext: jest.fn(),
        deleteUtterance: jest.fn(),
        saveUtteranceChanges: mockSaveUtteranceChanges
    })
}));

jest.mock('../../EditingContext', () => ({
    useEditing: () => ({
        selectedUtteranceIds: new Set<string>(),
        toggleSelection: jest.fn(),
        clearSelection: jest.fn(),
        extractSelectedSegment: jest.fn(),
        isProcessing: false,
        pushAction: mockPushAction
    })
}));

jest.mock('@/contexts/ShareContext', () => ({
    useShare: () => ({
        openShareDropdownAndCopy: jest.fn()
    })
}));

jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({
        toast: mockToast
    })
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key
}));

import { TooltipProvider } from '@/components/ui/tooltip';

describe('Utterance text editing history', () => {
    const utterance: Utterance = {
        id: 'utterance-1',
        startTimestamp: 10,
        endTimestamp: 12,
        text: 'Αρχικό κείμενο',
        drift: 0,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        speakerSegmentId: 'segment-1',
        uncertain: false,
        lastModifiedBy: null,
        discussionStatus: null,
        discussionSubjectId: null
    };

    beforeEach(() => {
        mockSeekTo.mockClear();
        mockTogglePlayPause.mockClear();
        mockSaveUtteranceChanges.mockClear();
        mockPushAction.mockClear();
        mockToast.mockClear();

        mockSaveUtteranceChanges.mockImplementation(async (utteranceId: string, updates: { text: string; startTimestamp: number; endTimestamp: number; }) => ({
            ...utterance,
            id: utteranceId,
            text: updates.text,
            startTimestamp: updates.startTimestamp,
            endTimestamp: updates.endTimestamp,
            lastModifiedBy: 'user'
        }));
    });

    it('registers undo/redo history for saved text changes', async () => {
        render(
            <TooltipProvider>
                <UtteranceC utterance={utterance} />
            </TooltipProvider>
        );

        fireEvent.click(screen.getByText(/Αρχικό κείμενο/));


        const textarea = await screen.findByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'Ενημερωμένο κείμενο' } });
        fireEvent.keyDown(textarea, { key: 'Enter' });

        await waitFor(() => {
            expect(mockSaveUtteranceChanges).toHaveBeenCalledWith('utterance-1', {
                text: 'Ενημερωμένο κείμενο',
                startTimestamp: 10,
                endTimestamp: 12
            });
        });

        expect(mockPushAction).toHaveBeenCalledTimes(1);
        expect(mockPushAction).toHaveBeenCalledWith({
            type: 'TEXT_EDIT',
            payload: {
                utteranceId: 'utterance-1',
                previousState: {
                    text: 'Αρχικό κείμενο',
                    startTimestamp: 10,
                    endTimestamp: 12
                },
                nextState: {
                    text: 'Ενημερωμένο κείμενο',
                    startTimestamp: 10,
                    endTimestamp: 12
                }
            }
        });
    });
});

