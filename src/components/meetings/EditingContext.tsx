"use client";
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
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
    
    const { transcript, extractSpeakerSegment, getSpeakerSegmentById } = useCouncilMeetingData();
    const { toast } = useToast();
    const t = useTranslations('editing.toasts');

    // Flatten utterances for easy range index finding
    // Memoizing this might be expensive if transcript changes often, but necessary for range selection
    const allUtterances = React.useMemo(() => {
        return transcript.flatMap(segment => segment.utterances);
    }, [transcript]);

    const clearSelection = useCallback(() => {
        setSelectedUtteranceIds(new Set());
        setLastClickedUtteranceId(null);
    }, []);

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

    // Register Shortcuts
    useKeyboardShortcut(ACTIONS.EXTRACT_SEGMENT.id, extractSelectedSegment, selectedUtteranceIds.size > 0);
    useKeyboardShortcut(ACTIONS.CLEAR_SELECTION.id, clearSelection, selectedUtteranceIds.size > 0);

    return (
        <EditingContext.Provider value={{
            selectedUtteranceIds,
            lastClickedUtteranceId,
            toggleSelection,
            clearSelection,
            extractSelectedSegment,
            isProcessing
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
