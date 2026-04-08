"use client";
import React, { createContext, useContext, useState, useCallback, useRef, ReactNode, useMemo } from 'react';
import { useCouncilMeetingData, useCouncilMeetingTranscript } from './CouncilMeetingDataContext';
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

    // Subscribe to transcript context — EditingProvider re-renders on transcript changes (cheap,
    // it's one component). We store transcript in a ref so callbacks can read the latest value
    // without depending on it — this is the standard React pattern for stable event handlers.
    const { transcript } = useCouncilMeetingTranscript();
    const { extractSpeakerSegment } = useCouncilMeetingData();
    const { toast } = useToast();
    const t = useTranslations('editing.toasts');

    // Single internal ref: read latest transcript in callbacks without adding it as a dep.
    // This prevents toggleSelection/extractSelectedSegment from changing on every transcript edit.
    const transcriptRef = useRef(transcript);
    transcriptRef.current = transcript;

    const clearSelection = useCallback(() => {
        setSelectedUtteranceIds(new Set());
        setLastClickedUtteranceId(null);
    }, []);

    const toggleSelection = useCallback((id: string, modifiers: { shift: boolean, ctrl: boolean }) => {
        setSelectedUtteranceIds(prev => {
            const newSet = new Set(prev);

            if (modifiers.shift && lastClickedUtteranceId) {
                // Compute allUtterances lazily from ref
                const allUtterances = transcriptRef.current.flatMap(segment => segment.utterances);
                const rangeIds = calculateUtteranceRange(allUtterances, lastClickedUtteranceId, id);
                rangeIds.forEach(rangeId => newSet.add(rangeId));
            } else if (modifiers.ctrl) {
                if (newSet.has(id)) {
                    newSet.delete(id);
                } else {
                    newSet.add(id);
                }
                setLastClickedUtteranceId(id);
            } else {
                newSet.clear();
                newSet.add(id);
                setLastClickedUtteranceId(id);
            }

            return newSet;
        });
    // lastClickedUtteranceId changes on user clicks — that's fine because
    // the context value already changes when lastClickedUtteranceId changes.
    }, [lastClickedUtteranceId]);

    const extractSelectedSegment = useCallback(async () => {
        if (isProcessing) return;
        if (selectedUtteranceIds.size === 0) return;

        setIsProcessing(true);
        try {
            const allUtterances = transcriptRef.current.flatMap(segment => segment.utterances);
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
            const originalSegment = transcriptRef.current.find(s => s.id === targetSegmentId);
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
    // These deps change on user actions (selection, processing) — not on transcript edits.
    }, [selectedUtteranceIds, isProcessing, extractSpeakerSegment, clearSelection, toast, t]);

    // Register Shortcuts
    useKeyboardShortcut(ACTIONS.EXTRACT_SEGMENT.id, extractSelectedSegment, selectedUtteranceIds.size > 0);
    useKeyboardShortcut(ACTIONS.CLEAR_SELECTION.id, clearSelection, selectedUtteranceIds.size > 0);

    // Memoize value — changes on user actions (selection, processing), NOT on transcript edits.
    const value = useMemo(() => ({
        selectedUtteranceIds,
        lastClickedUtteranceId,
        toggleSelection,
        clearSelection,
        extractSelectedSegment,
        isProcessing,
    }), [selectedUtteranceIds, lastClickedUtteranceId, toggleSelection, clearSelection, extractSelectedSegment, isProcessing]);

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
