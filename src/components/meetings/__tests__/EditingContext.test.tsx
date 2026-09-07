import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

import { EditingProvider, useEditing } from '../EditingContext';

const deleteUtterances = jest.fn();
const extractSpeakerSegment = jest.fn();

const mockTranscript = [
    {
        id: 'segment-a',
        utterances: [
            { id: 'u-1', speakerSegmentId: 'segment-a', startTimestamp: 10, endTimestamp: 15 },
            { id: 'u-2', speakerSegmentId: 'segment-a', startTimestamp: 20, endTimestamp: 25 },
        ],
    },
];

jest.mock('../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({
        transcript: mockTranscript,
        getSpeakerSegmentById: (id: string) => mockTranscript.find((s) => s.id === id),
    }),
    useCouncilMeetingActions: () => ({
        deleteUtterances,
        extractSpeakerSegment,
    }),
}));

const shortcutEnabled: Record<string, boolean> = {};
jest.mock('@/contexts/KeyboardShortcutsContext', () => ({
    ACTIONS: {
        EXTRACT_SEGMENT: { id: 'extract' },
        CLEAR_SELECTION: { id: 'clear' },
        DELETE_SELECTION: { id: 'delete' },
    },
    useKeyboardShortcut: (actionId: string, _handler: unknown, enabled: boolean) => {
        shortcutEnabled[actionId] = enabled;
    },
}));

jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, opts?: { count?: number; defaultValue?: string }) => {
        if (opts && typeof opts.count === 'number') {
            return `${key}:${opts.count}`;
        }
        return key;
    },
}));

type HarnessApi = ReturnType<typeof useEditing>;
let api: HarnessApi;

function Harness() {
    api = useEditing();
    return null;
}

function renderProvider() {
    return render(
        <EditingProvider>
            <Harness />
        </EditingProvider>,
    );
}

beforeEach(() => {
    deleteUtterances.mockReset();
    deleteUtterances.mockResolvedValue(undefined);
});

describe('EditingContext bulk delete', () => {
    it('right-click single → dialog shows count 1 and confirm deletes that id even after selection is cleared', async () => {
        renderProvider();

        // Menu's "temp-select for visual feedback" path.
        act(() => {
            api.toggleSelection('u-1', { shift: false, ctrl: false });
        });
        // Open dialog with explicit id (mirrors UtteranceContextMenu's call).
        act(() => {
            api.confirmDeleteSelected(['u-1']);
        });
        // Menu close handler clears its temp-selection. This used to wipe the
        // dialog's target list and turn the confirm button into a no-op.
        act(() => {
            api.clearSelection();
        });

        expect(screen.getByText('bulkDeleteConfirmDesc:1')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });

        expect(deleteUtterances).toHaveBeenCalledTimes(1);
        expect(deleteUtterances).toHaveBeenCalledWith(['u-1']);
        expect(screen.queryByText('bulkDeleteConfirmDesc:1')).not.toBeInTheDocument();
    });

    it('right-click single with no prior selection still deletes (regression for the freeze)', async () => {
        renderProvider();

        act(() => {
            api.confirmDeleteSelected(['u-2']);
        });

        expect(screen.getByText('bulkDeleteConfirmDesc:1')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });

        expect(deleteUtterances).toHaveBeenCalledWith(['u-2']);
    });

    it('deselectUtterance removes only the given id, keeping the rest of the selection intact', () => {
        renderProvider();

        act(() => {
            api.toggleSelection('u-1', { shift: false, ctrl: false });
        });
        act(() => {
            api.toggleSelection('u-2', { shift: false, ctrl: true });
        });
        act(() => {
            api.deselectUtterance('u-1');
        });

        expect(Array.from(api.selectedUtteranceIds)).toEqual(['u-2']);
    });

    it('CLEAR_SELECTION and DELETE_SELECTION shortcuts are disabled while the delete dialog is open', () => {
        renderProvider();

        act(() => {
            api.toggleSelection('u-1', { shift: false, ctrl: false });
        });
        expect(shortcutEnabled['clear']).toBe(true);
        expect(shortcutEnabled['delete']).toBe(true);

        act(() => {
            api.confirmDeleteSelected(['u-1']);
        });
        expect(shortcutEnabled['clear']).toBe(false);
        expect(shortcutEnabled['delete']).toBe(false);
    });

    it('multi-select → confirmDeleteSelected() without explicit ids uses the current selection', async () => {
        renderProvider();

        act(() => {
            api.toggleSelection('u-1', { shift: false, ctrl: false });
        });
        act(() => {
            api.toggleSelection('u-2', { shift: false, ctrl: true });
        });
        act(() => {
            api.confirmDeleteSelected();
        });

        expect(screen.getByText('bulkDeleteConfirmDesc:2')).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByText('common.delete'));
        });

        expect(deleteUtterances).toHaveBeenCalledTimes(1);
        const callArg = deleteUtterances.mock.calls[0][0] as string[];
        expect([...callArg].sort()).toEqual(['u-1', 'u-2']);
    });
});
