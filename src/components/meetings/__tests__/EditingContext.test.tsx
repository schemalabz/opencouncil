import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { EditingProvider, useEditing } from '../EditingContext';

const mockToast = jest.fn();
const mockExtractSpeakerSegment = jest.fn();
const mockSaveUtteranceChanges = jest.fn();
const mockMoveUtterancesToPrevious = jest.fn();
const mockMoveUtterancesToNext = jest.fn();
const mockUpdateSpeakerTagPerson = jest.fn();
const mockUpdateSpeakerTagLabel = jest.fn();

let editable = false;

jest.mock('../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({
        transcript: [
            {
                id: 'segment-1',
                utterances: [
                    {
                        id: 'utterance-1',
                        speakerSegmentId: 'segment-1',
                        startTimestamp: 1,
                        endTimestamp: 2,
                        text: 'Hello'
                    }
                ]
            }
        ],
        extractSpeakerSegment: mockExtractSpeakerSegment,
        getSpeakerSegmentById: () => null,
        saveUtteranceChanges: mockSaveUtteranceChanges,
        moveUtterancesToPrevious: mockMoveUtterancesToPrevious,
        moveUtterancesToNext: mockMoveUtterancesToNext,
        updateSpeakerTagPerson: mockUpdateSpeakerTagPerson,
        updateSpeakerTagLabel: mockUpdateSpeakerTagLabel
    })
}));

jest.mock('../options/OptionsContext', () => ({
    useTranscriptOptions: () => ({
        options: {
            editable
        }
    })
}));

jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({
        toast: mockToast
    })
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string>) => {
        if (values?.action) {
            return `${key}:${values.action}`;
        }
        return key;
    }
}));

jest.mock('@/contexts/KeyboardShortcutsContext', () => ({
    ACTIONS: {
        EXTRACT_SEGMENT: { id: 'EXTRACT_SEGMENT' },
        CLEAR_SELECTION: { id: 'CLEAR_SELECTION' },
        UNDO: { id: 'UNDO' },
        REDO: { id: 'REDO' }
    },
    useKeyboardShortcut: jest.fn()
}));

describe('EditingContext', () => {
    let latestContext: ReturnType<typeof useEditing> | null = null;

    function ContextObserver() {
        latestContext = useEditing();
        return null;
    }

    const getContext = () => {
        if (!latestContext) {
            throw new Error('Editing context not initialized');
        }
        return latestContext;
    };

    beforeEach(() => {
        editable = false;
        latestContext = null;
        mockToast.mockClear();
        mockExtractSpeakerSegment.mockClear();
        mockSaveUtteranceChanges.mockClear();
        mockMoveUtterancesToPrevious.mockClear();
        mockMoveUtterancesToNext.mockClear();
        mockUpdateSpeakerTagPerson.mockClear();
        mockUpdateSpeakerTagLabel.mockClear();
    });

    it('starts and resets an editing session while supporting undo/redo history', async () => {
        const undoSpy = jest.fn().mockResolvedValue(undefined);
        const redoSpy = jest.fn().mockResolvedValue(undefined);

        const { rerender } = render(
            <EditingProvider>
                <ContextObserver />
            </EditingProvider>
        );

        expect(getContext().sessionStartedAt).toBeNull();
        expect(getContext().canUndo).toBe(false);
        expect(getContext().canRedo).toBe(false);

        editable = true;
        rerender(
            <EditingProvider>
                <ContextObserver />
            </EditingProvider>
        );

        await waitFor(() => {
            expect(getContext().sessionStartedAt).not.toBeNull();
        });

        act(() => {
            getContext().pushAction({
                type: 'TEXT_EDIT',
                payload: {
                    utteranceId: 'utterance-1',
                    previousState: { text: 'Hello', startTimestamp: 1, endTimestamp: 2 },
                    nextState: { text: 'Hello edited', startTimestamp: 1, endTimestamp: 2 }
                }
            });
        });

        await waitFor(() => {
            expect(getContext().canUndo).toBe(true);
            expect(getContext().sessionChangeCount).toBe(1);
        });

        await act(async () => {
            await getContext().undoLastChange();
        });

        expect(mockSaveUtteranceChanges).toHaveBeenCalledWith('utterance-1', {
            text: 'Hello',
            startTimestamp: 1,
            endTimestamp: 2
        });
        expect(getContext().canRedo).toBe(true);

        await act(async () => {
            await getContext().redoLastChange();
        });

        expect(mockSaveUtteranceChanges).toHaveBeenLastCalledWith('utterance-1', {
            text: 'Hello edited',
            startTimestamp: 1,
            endTimestamp: 2
        });
        expect(getContext().canUndo).toBe(true);

        editable = false;
        rerender(
            <EditingProvider>
                <ContextObserver />
            </EditingProvider>
        );

        await waitFor(() => {
            expect(getContext().sessionStartedAt).toBeNull();
            expect(getContext().sessionChangeCount).toBe(0);
        });
    });
});
