"use client";
import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from 'react';
import { useCouncilMeetingData, useCouncilMeetingActions } from './CouncilMeetingDataContext';
import { ACTIONS, useKeyboardShortcut } from '@/contexts/KeyboardShortcutsContext';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { calculateUtteranceRange } from '@/lib/selection-utils';

interface EditingContextType {
    selectedUtteranceIds: Set<string>;
    lastClickedUtteranceId: string | null;
    toggleSelection: (id: string, modifiers: { shift: boolean, ctrl: boolean }) => void;
    clearSelection: () => void;
    extractSelectedSegment: () => Promise<void>;
    isProcessing: boolean;
}

const EditingContext = createContext<EditingContextType | undefined>(undefined);

export function EditingProvider({ children }: { children: ReactNode }) {
    const [selectedUtteranceIds, setSelectedUtteranceIds] = useState<Set<string>>(new Set());
    const [lastClickedUtteranceId, setLastClickedUtteranceId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const { transcript, getSpeakerSegmentById } = useCouncilMeetingData();
    const { extractSpeakerSegment } = useCouncilMeetingActions();
    const { toast } = useToast();
    const t = useTranslations('editing.toasts');

    // Refs read only inside callbacks (not in render output), kept in sync
    // via render-time assignment so toggleSelection / extractSelectedSegment
    // can be useCallback(..., []) without observing stale values.
    const allUtterances = useMemo(() => transcript.flatMap(s => s.utterances), [transcript]);
    const allUtterancesRef = useRef(allUtterances);
    allUtterancesRef.current = allUtterances;
    const lastClickedRef = useRef(lastClickedUtteranceId);
    lastClickedRef.current = lastClickedUtteranceId;

    const clearSelection = useCallback(() => {
        setSelectedUtteranceIds(new Set());
        setLastClickedUtteranceId(null);
    }, []);

    const toggleSelection = useCallback((id: string, modifiers: { shift: boolean, ctrl: boolean }) => {
        const isShiftRange = modifiers.shift && lastClickedRef.current;

        setSelectedUtteranceIds(prev => {
            const newSet = new Set(prev);
            if (isShiftRange) {
                const rangeIds = calculateUtteranceRange(allUtterancesRef.current, lastClickedRef.current!, id);
                rangeIds.forEach(rangeId => newSet.add(rangeId));
            } else if (modifiers.ctrl) {
                if (newSet.has(id)) newSet.delete(id);
                else newSet.add(id);
            } else {
                newSet.clear();
                newSet.add(id);
            }
            return newSet;
        });

        // Anchor moves on plain or ctrl click; shift-range click leaves it
        // alone (so subsequent shift-clicks keep extending from the same
        // anchor). Calling this outside the updater avoids the StrictMode
        // double-fire pitfall.
        if (!isShiftRange) {
            setLastClickedUtteranceId(id);
        }
    }, []);

    const extractSelectedSegment = useCallback(async () => {
        if (selectedUtteranceIds.size === 0) return;
        if (isProcessing) return;

        setIsProcessing(true);
        try {
            const allUtterances = allUtterancesRef.current;
            const selectedList = Array.from(selectedUtteranceIds);
            const firstUtterance = allUtterances.find(u => u.id === selectedList[0]);
            if (!firstUtterance) throw new Error("Selected utterance not found");

            const targetSegmentId = firstUtterance.speakerSegmentId;

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

            const indices = selectedList
                .map(id => allUtterances.findIndex(u => u.id === id))
                .sort((a, b) => a - b);

            const startUtteranceId = allUtterances[indices[0]].id;
            const endUtteranceId = allUtterances[indices[indices.length - 1]].id;

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
    }, [selectedUtteranceIds, isProcessing, extractSpeakerSegment, getSpeakerSegmentById, clearSelection, toast, t]);

    // Register Shortcuts
    useKeyboardShortcut(ACTIONS.EXTRACT_SEGMENT.id, extractSelectedSegment, selectedUtteranceIds.size > 0);
    useKeyboardShortcut(ACTIONS.CLEAR_SELECTION.id, clearSelection, selectedUtteranceIds.size > 0);

    // Memoized so EditingProvider re-renders (triggered by any
    // CouncilMeetingDataContext change) don't churn the value object and
    // re-render every Utterance consuming useEditing().
    const value = useMemo<EditingContextType>(() => ({
        selectedUtteranceIds,
        lastClickedUtteranceId,
        toggleSelection,
        clearSelection,
        extractSelectedSegment,
        isProcessing,
    }), [
        selectedUtteranceIds,
        lastClickedUtteranceId,
        toggleSelection,
        clearSelection,
        extractSelectedSegment,
        isProcessing,
    ]);

    return (
        <EditingContext.Provider value={value}>
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
