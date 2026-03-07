"use client";
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { ACTIONS, useKeyboardShortcut } from '@/contexts/KeyboardShortcutsContext';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { calculateUtteranceRange } from '@/lib/selection-utils';
import { useTranscriptOptions } from './options/OptionsContext';

import { EditAction, invertAction, getActionLabel } from '@/lib/editing/editActions';

interface EditingContextType {
    selectedUtteranceIds: Set<string>;
    lastClickedUtteranceId: string | null;
    toggleSelection: (id: string, modifiers: { shift: boolean, ctrl: boolean }) => void;
    clearSelection: () => void;
    extractSelectedSegment: () => Promise<void>;
    isProcessing: boolean;
    sessionStartedAt: Date | null;
    sessionChangeCount: number;
    canUndo: boolean;
    canRedo: boolean;
    isApplyingHistory: boolean;
    applyingHistoryType: 'undo' | 'redo' | null;
    pushAction: (action: EditAction) => void;
    undoLastChange: () => Promise<void>;
    redoLastChange: () => Promise<void>;
}

const EditingContext = createContext<EditingContextType | undefined>(undefined);

const MAX_HISTORY_SIZE = 100;

export function EditingProvider({ children }: { children: ReactNode }) {
    const [selectedUtteranceIds, setSelectedUtteranceIds] = useState<Set<string>>(new Set());
    const [lastClickedUtteranceId, setLastClickedUtteranceId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [undoStack, setUndoStack] = useState<EditAction[]>([]);
    const [redoStack, setRedoStack] = useState<EditAction[]>([]);
    const [isApplyingHistory, setIsApplyingHistory] = useState(false);
    const [applyingHistoryType, setApplyingHistoryType] = useState<'undo' | 'redo' | null>(null);
    const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
    const [sessionChangeCount, setSessionChangeCount] = useState(0);

    const {
        transcript,
        extractSpeakerSegment,
        getSpeakerSegmentById,
        saveUtteranceChanges,
        moveUtterancesToPrevious,
        moveUtterancesToNext,
        updateSpeakerTagPerson,
        updateSpeakerTagLabel
    } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const { toast } = useToast();
    const t = useTranslations('editing.toasts');
    const tHistory = useTranslations('editing.history');
    const previousEditableRef = useRef(options.editable);

    // Flatten utterances for easy range index finding
    // Memoizing this might be expensive if transcript changes often, but necessary for range selection
    const allUtterances = React.useMemo(() => {
        return transcript.flatMap(segment => segment.utterances);
    }, [transcript]);

    const clearSelection = useCallback(() => {
        setSelectedUtteranceIds(new Set());
        setLastClickedUtteranceId(null);
    }, []);

    const canUndo = undoStack.length > 0;
    const canRedo = redoStack.length > 0;

    const executeAction = useCallback(async (action: EditAction) => {
        switch (action.type) {
            case 'TEXT_EDIT':
                await saveUtteranceChanges(action.payload.utteranceId, action.payload.nextState);
                break;
            case 'MOVE_UTTERANCE':
                if (action.payload.direction === 'previous') {
                    await moveUtterancesToPrevious(action.payload.utteranceId, action.payload.fromSegmentId);
                } else {
                    await moveUtterancesToNext(action.payload.utteranceId, action.payload.fromSegmentId);
                }
                break;
            case 'SPEAKER_ASSIGNMENT':
                await updateSpeakerTagPerson(action.payload.speakerTagId, action.payload.nextPersonId);
                break;
            case 'SPEAKER_LABEL':
                await updateSpeakerTagLabel(action.payload.speakerTagId, action.payload.nextLabel);
                break;
        }
    }, [saveUtteranceChanges, moveUtterancesToPrevious, moveUtterancesToNext, updateSpeakerTagPerson, updateSpeakerTagLabel]);

    const pushAction = useCallback((action: EditAction) => {
        if (!options.editable || isApplyingHistory) {
            return;
        }

        setUndoStack(prev => [...prev.slice(-(MAX_HISTORY_SIZE - 1)), action]);
        setRedoStack([]);
        setSessionChangeCount(prev => prev + 1);
    }, [isApplyingHistory, options.editable]);

    const undoLastChange = useCallback(async () => {
        if (isApplyingHistory || undoStack.length === 0) {
            return;
        }

        const action = undoStack[undoStack.length - 1];
        setIsApplyingHistory(true);
        setApplyingHistoryType('undo');
        try {
            await executeAction(invertAction(action));
            setUndoStack(prev => prev.slice(0, -1));
            setRedoStack(prev => [...prev, action]);
            toast({
                description: t('undoSuccess', { action: getActionLabel(action, (key) => tHistory(key)) })
            });
        } catch (error) {
            console.error(error);
            toast({
                title: t('undoErrorTitle'),
                description: t('undoError'),
                variant: 'destructive'
            });
        } finally {
            setIsApplyingHistory(false);
            setApplyingHistoryType(null);
        }
    }, [isApplyingHistory, undoStack, executeAction, toast, t, tHistory]);

    const redoLastChange = useCallback(async () => {
        if (isApplyingHistory || redoStack.length === 0) {
            return;
        }

        const action = redoStack[redoStack.length - 1];
        setIsApplyingHistory(true);
        setApplyingHistoryType('redo');
        try {
            await executeAction(action);
            setRedoStack(prev => prev.slice(0, -1));
            setUndoStack(prev => [...prev, action]);
            toast({
                description: t('redoSuccess', { action: getActionLabel(action, (key) => tHistory(key)) })
            });
        } catch (error) {
            console.error(error);
            toast({
                title: t('redoErrorTitle'),
                description: t('redoError'),
                variant: 'destructive'
            });
        } finally {
            setIsApplyingHistory(false);
            setApplyingHistoryType(null);
        }
    }, [isApplyingHistory, redoStack, executeAction, toast, t, tHistory]);

    const toggleSelection = useCallback((id: string, modifiers: { shift: boolean, ctrl: boolean }) => {
        setSelectedUtteranceIds(prev => {
            const newSet = new Set(prev);

            if (modifiers.shift && lastClickedUtteranceId) {
                // Range selection using shared utility
                const rangeIds = calculateUtteranceRange(allUtterances, lastClickedUtteranceId, id);
                rangeIds.forEach(rangeId => newSet.add(rangeId));
            } else if (modifiers.ctrl) {
                // Toggle individual
                if (newSet.has(id)) {
                    newSet.delete(id);
                } else {
                    newSet.add(id);
                }
                setLastClickedUtteranceId(id);
            } else {
                // Single select (clear others)
                newSet.clear();
                newSet.add(id);
                setLastClickedUtteranceId(id);
            }

            return newSet;
        });
    }, [allUtterances, lastClickedUtteranceId]);

    const extractSelectedSegment = useCallback(async () => {
        if (selectedUtteranceIds.size === 0) return;
        if (isProcessing) return;

        setIsProcessing(true);
        try {
            const selectedList = Array.from(selectedUtteranceIds);
            const firstUtterance = allUtterances.find(u => u.id === selectedList[0]);
            if (!firstUtterance) throw new Error("Selected utterance not found");

            const targetSegmentId = firstUtterance.speakerSegmentId;
            
            // Validate all selected utterances belong to the same segment
            const allInSame = selectedList.every(id => {
                const u = allUtterances.find(ut => ut.id === id);
                return u && u.speakerSegmentId === targetSegmentId;
            });

            if (!allInSame) {
                toast({
                    title: t('selectionErrorTitle'),
                    description: t('selectionErrorDiffSegments'),
                    variant: "destructive"
                });
                return;
            }

            // Find chronological start and end utterances
            const indices = selectedList
                .map(id => allUtterances.findIndex(u => u.id === id))
                .sort((a, b) => a - b);
            
            const startUtteranceId = allUtterances[indices[0]].id;
            const endUtteranceId = allUtterances[indices[indices.length - 1]].id;

            // Validate extraction leaves utterances before and after (A-B-A pattern)
            const originalSegment = getSpeakerSegmentById(targetSegmentId);
            if (originalSegment) {
                const totalUtterances = originalSegment.utterances.length;
                const segmentStartIndex = originalSegment.utterances.findIndex(u => u.id === startUtteranceId);
                const segmentEndIndex = originalSegment.utterances.findIndex(u => u.id === endUtteranceId);
                const extractionCount = segmentEndIndex - segmentStartIndex + 1;

                if (extractionCount === totalUtterances) {
                     toast({
                        title: t('invalidOperationTitle'),
                        description: t('invalidOperationExtractAll'),
                        variant: "destructive"
                    });
                    return;
                }

                if (segmentStartIndex === 0 || segmentEndIndex === totalUtterances - 1) {
                    toast({
                        title: t('invalidOperationTitle'),
                        description: t('invalidOperationExtractStartEnd'),
                        variant: "destructive"
                    });
                    return;
                }
            }

            await extractSpeakerSegment(targetSegmentId, startUtteranceId, endUtteranceId);
            
            clearSelection();
            toast({
                description: t('extractionSuccess')
            });

        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: t('extractionError'),
                variant: "destructive"
            });
        } finally {
            setIsProcessing(false);
        }
    }, [selectedUtteranceIds, isProcessing, allUtterances, extractSpeakerSegment, clearSelection, toast, transcript, t]);

    useEffect(() => {
        const wasEditable = previousEditableRef.current;

        if (options.editable && !wasEditable) {
            setSessionStartedAt(new Date());
            setUndoStack([]);
            setRedoStack([]);
            setSessionChangeCount(0);
            setIsApplyingHistory(false);
            toast({
                title: t('sessionStarted'),
                description: t('sessionStartedDescription')
            });
        }

        if (!options.editable && wasEditable) {
            setSessionStartedAt(null);
            setUndoStack([]);
            setRedoStack([]);
            setSessionChangeCount(0);
            setIsApplyingHistory(false);
            clearSelection();
        }

        previousEditableRef.current = options.editable;
    }, [options.editable, clearSelection, toast, t]);

    // Register Shortcuts
    useKeyboardShortcut(ACTIONS.EXTRACT_SEGMENT.id, extractSelectedSegment, selectedUtteranceIds.size > 0);
    useKeyboardShortcut(ACTIONS.CLEAR_SELECTION.id, clearSelection, selectedUtteranceIds.size > 0);
    useKeyboardShortcut(ACTIONS.UNDO.id, () => void undoLastChange(), options.editable && canUndo && !isApplyingHistory);
    useKeyboardShortcut(ACTIONS.REDO.id, () => void redoLastChange(), options.editable && canRedo && !isApplyingHistory);

    return (
        <EditingContext.Provider value={{
            selectedUtteranceIds,
            lastClickedUtteranceId,
            toggleSelection,
            clearSelection,
            extractSelectedSegment,
            isProcessing,
            sessionStartedAt,
            sessionChangeCount,
            canUndo,
            canRedo,
            isApplyingHistory,
            applyingHistoryType,
            pushAction,
            undoLastChange,
            redoLastChange
        }}>
            {children}
        </EditingContext.Provider>
    );
}

export function useEditing() {
    const context = useContext(EditingContext);
    if (context === undefined) {
        throw new Error('useEditing must be used within an EditingProvider');
    }
    return context;
}
