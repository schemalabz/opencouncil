import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { EditingProvider, useEditing } from '../../EditingContext';
import { UtteranceContextMenu } from '../UtteranceContextMenu';

const mockDeleteUtterances = jest.fn();
const mockTranscript = [{
    id: 'segment',
    utterances: ['u-1', 'u-2', 'u-3'].map((id, index) => ({
        id, speakerSegmentId: 'segment', startTimestamp: index, endTimestamp: index + 1,
    })),
}];

jest.mock('../../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({
        transcript: mockTranscript,
        getSpeakerSegmentById: () => mockTranscript[0],
    }),
    useCouncilMeetingActions: () => ({
        deleteUtterances: mockDeleteUtterances,
        extractSpeakerSegment: jest.fn(),
        moveUtterancesToPrevious: jest.fn(),
        moveUtterancesToNext: jest.fn(),
    }),
}));
jest.mock('@/contexts/KeyboardShortcutsContext', () => ({
    ACTIONS: {
        EXTRACT_SEGMENT: { id: 'extract' },
        CLEAR_SELECTION: { id: 'clear' },
        DELETE_SELECTION: { id: 'delete' },
    },
    useKeyboardShortcut: jest.fn(),
}));
jest.mock('../../options/OptionsContext', () => ({
    useTranscriptOptions: () => ({ options: { editable: true, canCreateHighlights: false } }),
}));
jest.mock('../../HighlightContext', () => ({ useHighlight: () => ({ editingHighlight: null }) }));
jest.mock('@/contexts/ShareContext', () => ({ useShare: () => ({ openShareDropdownAndCopy: jest.fn() }) }));
jest.mock('@/components/sharing/ExcerptSelectionToolbar', () => ({ EXCERPT_SHARE_EVENT: 'share-excerpt' }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, opts?: { count?: number }) =>
        opts?.count === undefined ? key : `${key}:${opts.count}`,
}));

let api: ReturnType<typeof useEditing>;
function Transcript() {
    api = useEditing();
    return (
        <UtteranceContextMenu canShareExcerpt={false}>
            {mockTranscript[0].utterances.map(utterance => (
                <span key={utterance.id} data-utterance-id={utterance.id} data-segment-id="segment">
                    {utterance.id}
                </span>
            ))}
        </UtteranceContextMenu>
    );
}

function renderTranscript(selectedIds: string[] = []) {
    render(<EditingProvider><Transcript /></EditingProvider>);
    selectedIds.forEach((id, index) => {
        act(() => api.toggleSelection(id, { shift: false, ctrl: index > 0 }));
    });
}

beforeEach(() => {
    mockDeleteUtterances.mockReset().mockResolvedValue(undefined);
});

it('preserves a multi-selection when opening and dismissing the menu outside it', async () => {
    renderTranscript(['u-1', 'u-2']);
    fireEvent.contextMenu(screen.getByText('u-3'));

    expect(Array.from(api.selectedUtteranceIds)).toEqual(['u-1', 'u-2']);
    const menu = await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'contextMenu.deleteUtterance' })).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(Array.from(api.selectedUtteranceIds)).toEqual(['u-1', 'u-2']);
});

it('deletes only the outside target and preserves the selection when the dialog is cancelled', async () => {
    renderTranscript(['u-1', 'u-2']);
    fireEvent.contextMenu(screen.getByText('u-3'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'contextMenu.deleteUtterance' }));

    await screen.findByText('bulkDeleteConfirmDesc:1');
    expect(Array.from(api.selectedUtteranceIds)).toEqual(['u-1', 'u-2']);
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(Array.from(api.selectedUtteranceIds)).toEqual(['u-1', 'u-2']);
    expect(mockDeleteUtterances).not.toHaveBeenCalled();

    fireEvent.contextMenu(screen.getByText('u-3'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'contextMenu.deleteUtterance' }));
    await screen.findByText('bulkDeleteConfirmDesc:1');
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(mockDeleteUtterances).toHaveBeenCalledWith(['u-3']));
});

it('deletes the entire selection when the menu target is selected', async () => {
    renderTranscript(['u-1', 'u-2']);
    fireEvent.contextMenu(screen.getByText('u-2'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'contextMenu.deleteSelectedUtterances:2' }));

    await screen.findByText('bulkDeleteConfirmDesc:2');
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(mockDeleteUtterances).toHaveBeenCalledWith(['u-1', 'u-2']));
});

it('keeps the deletion target after closing a menu that temporarily selected it', async () => {
    renderTranscript();
    fireEvent.contextMenu(screen.getByText('u-3'));
    expect(Array.from(api.selectedUtteranceIds)).toEqual(['u-3']);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'contextMenu.deleteUtterance' }));

    await screen.findByText('bulkDeleteConfirmDesc:1');
    expect(api.selectedUtteranceIds.size).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    await waitFor(() => expect(mockDeleteUtterances).toHaveBeenCalledWith(['u-3']));
});
