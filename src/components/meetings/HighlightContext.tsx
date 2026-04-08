"use client";
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { HighlightWithUtterances } from '@/lib/db/highlights';
import { useCouncilMeetingData, useCouncilMeetingTranscript } from './CouncilMeetingDataContext';
import { useVideo } from './VideoProvider';
import { Utterance } from '@prisma/client';
import { calculateUtteranceRange } from '@/lib/selection-utils';

export interface HighlightUtterance {
  id: string;
  text: string;
  startTimestamp: number;
  endTimestamp: number;
  speakerSegmentId: string;
  speakerName: string;
}

export interface HighlightStatistics {
  duration: number;
  utteranceCount: number;
  speakerCount: number;
}

export interface HighlightCalculationResult {
  statistics: HighlightStatistics;
  highlightUtterances: HighlightUtterance[];
}

interface HighlightContextType {
  editingHighlight: HighlightWithUtterances | null;
  previewMode: boolean;
  isPreviewDialogOpen: boolean;
  statistics: HighlightStatistics | null;
  highlightUtterances: HighlightUtterance[] | null;
  currentHighlightIndex: number;
  totalHighlights: number;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isCreating: boolean;
  isEditingDisabled: boolean;
  enterEditMode: (highlight: HighlightWithUtterances) => void;
  updateHighlightUtterances: (utteranceId: string, action: 'add' | 'remove', modifiers?: { shift: boolean }) => void;
  resetToOriginal: () => void;
  exitEditMode: () => void;
  exitEditModeAndRedirectToHighlight: () => void;
  goToPreviousHighlight: () => void;
  goToNextHighlight: () => void;
  goToHighlightIndex: (index: number) => void;
  togglePreviewMode: () => void;
  openPreviewDialog: () => void;
  closePreviewDialog: () => void;
  calculateHighlightData: (highlight: HighlightWithUtterances | null) => HighlightCalculationResult | null;
  saveHighlight: (options?: {
    name?: string;
    subjectId?: string | null;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
  }) => Promise<{ success: boolean; error?: any }>;
  createHighlight: (options: {
    preSelectedUtteranceId?: string;
    onSuccess?: (highlight: HighlightWithUtterances) => void;
    onError?: (error: Error) => void;
  }) => Promise<{ success: boolean; error?: any }>;
}

const HighlightContext = createContext<HighlightContextType | undefined>(undefined);

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const [editingHighlight, setEditingHighlight] = useState<HighlightWithUtterances | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [currentHighlightIndex, setCurrentHighlightIndex] = useState(0);
  const [originalHighlight, setOriginalHighlight] = useState<HighlightWithUtterances | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [lastClickedUtteranceId, setLastClickedUtteranceId] = useState<string | null>(null);
  const [lastClickedAction, setLastClickedAction] = useState<'add' | 'remove' | null>(null);

  // Subscribe to transcript context — provider re-renders on transcript changes (cheap).
  // Store in ref so callbacks read latest value without depending on it.
  const { transcript } = useCouncilMeetingTranscript();
  const { getSpeakerTag, getPerson, meeting, addHighlight, updateHighlight } = useCouncilMeetingData();
  const { currentTime, seekTo, isPlaying, setIsPlaying, seekToAndPlay } = useVideo();
  const router = useRouter();
  const pathname = usePathname();

  // Single internal ref for stable callback access to transcript
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  // Helper: build utterance map from transcript ref (lazily, not as a memo)
  const buildUtteranceMap = useCallback(() => {
    const map = new Map<string, Utterance>();
    transcriptRef.current.forEach(segment => {
      segment.utterances.forEach(utterance => {
        map.set(utterance.id, utterance);
      });
    });
    return map;
  }, []);

  const calculateHighlightData = useCallback((highlight: HighlightWithUtterances | null): HighlightCalculationResult | null => {
      if (!highlight) {
        return null;
      }

      const utteranceMap = buildUtteranceMap();

      // Extract highlight utterances with timestamps and speaker information
      const utterances: HighlightUtterance[] = [];
      highlight.highlightedUtterances.forEach(hu => {
        const utterance = utteranceMap.get(hu.utteranceId);
        if (utterance) {
          const segment = transcriptRef.current.find(s => s.id === utterance.speakerSegmentId);
          const speakerTag = segment ? getSpeakerTag(segment.speakerTagId) : null;
          const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
          const speakerName = person ? person.name_short : speakerTag?.label || 'Unknown';

          utterances.push({
            id: utterance.id,
            text: utterance.text,
            startTimestamp: utterance.startTimestamp,
            endTimestamp: utterance.endTimestamp,
            speakerSegmentId: utterance.speakerSegmentId,
            speakerName
          });
        }
      });

      // Sort utterances chronologically
      utterances.sort((a, b) => a.startTimestamp - b.startTimestamp);

      // Calculate statistics
      const utteranceCount = utterances.length;

      const duration = utterances.reduce((total, utterance: HighlightUtterance) => {
        return total + (utterance.endTimestamp - utterance.startTimestamp);
      }, 0);

      // Calculate speaker count
      const speakerNames = new Set<string>();
      utterances.forEach(utterance => {
        speakerNames.add(utterance.speakerName);
      });
      const speakerCount = speakerNames.size;

      const statistics = {
        duration,
        utteranceCount,
        speakerCount
      };

      return { statistics, highlightUtterances: utterances };
    }, [buildUtteranceMap, getSpeakerTag, getPerson]);

  // Calculate data for the currently editing highlight
  const editingHighlightData = useMemo(() => {
    return calculateHighlightData(editingHighlight);
  }, [calculateHighlightData, editingHighlight]);

  const statistics = editingHighlightData?.statistics || null;
  const highlightUtterances = editingHighlightData?.highlightUtterances || null;

  // Calculate total highlights
  const totalHighlights = highlightUtterances?.length || 0;

  // Guard to prevent repeated auto-advance loops during wrap-around seeks
  const isAutoAdvancingRef = useRef(false);

  // Auto-update current highlight index based on video time
  useEffect(() => {
    if (!highlightUtterances || highlightUtterances.length === 0) {
      setCurrentHighlightIndex(0);
      return;
    }

    // Find which highlighted utterance we're currently in
    const currentIndex = highlightUtterances.findIndex(utterance =>
      currentTime >= utterance.startTimestamp && currentTime <= utterance.endTimestamp
    );

    // Only update if we found a valid index and it's different from current
    if (currentIndex !== -1 && currentIndex !== currentHighlightIndex) {
      setCurrentHighlightIndex(currentIndex);
    }
  }, [currentTime, highlightUtterances, currentHighlightIndex]);

  // Initialize highlight index when entering highlight mode
  useEffect(() => {
    if (editingHighlight && highlightUtterances && highlightUtterances.length > 0) {
      // When entering highlight mode, seek to the first highlight
      setCurrentHighlightIndex(0);
      seekTo(highlightUtterances[0].startTimestamp);
    }
    // We only need to run this effect when the editingHighlight changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingHighlight?.id]);

  // Auto-advance logic for preview mode
  useEffect(() => {
    if (!previewMode || !highlightUtterances || !isPlaying || highlightUtterances.length === 0) {
      return;
    }

    // Prevent rapid re-entrancy while a programmatic seek is in flight
    if (isAutoAdvancingRef.current) {
      return;
    }

    const currentUtterance = highlightUtterances[currentHighlightIndex];
    if (!currentUtterance) return;

    if (currentTime >= currentUtterance.endTimestamp) {
      // Auto-advance to next highlight (wrap to start at the end)
      const nextIndex = (currentHighlightIndex + 1) % totalHighlights;
      isAutoAdvancingRef.current = true;
      setCurrentHighlightIndex(nextIndex);
      seekTo(highlightUtterances[nextIndex].startTimestamp);
      // Allow time for the seek/currentTime to propagate before re-evaluating
      setTimeout(() => { isAutoAdvancingRef.current = false; }, 150);
    }
  }, [currentTime, previewMode, highlightUtterances, currentHighlightIndex, isPlaying, totalHighlights, seekTo]);

  // Enhanced navigation functions
  const goToPreviousHighlight = useCallback(() => {
    if (!highlightUtterances || highlightUtterances.length === 0) return;

    let newIndex: number;

    if (currentHighlightIndex > 0) {
      newIndex = currentHighlightIndex - 1;
    } else if (previewMode) {
      newIndex = totalHighlights - 1;
    } else {
      return;
    }

    setIsPlaying(false);
    setCurrentHighlightIndex(newIndex);
    seekToAndPlay(highlightUtterances[newIndex].startTimestamp);
  }, [highlightUtterances, currentHighlightIndex, previewMode, totalHighlights, setIsPlaying, seekToAndPlay]);

  const goToNextHighlight = useCallback(() => {
    if (!highlightUtterances || highlightUtterances.length === 0) return;

    let newIndex: number;

    if (currentHighlightIndex < totalHighlights - 1) {
      newIndex = currentHighlightIndex + 1;
    } else if (previewMode) {
      newIndex = 0;
    } else {
      return;
    }

    setIsPlaying(false);
    setCurrentHighlightIndex(newIndex);
    seekToAndPlay(highlightUtterances[newIndex].startTimestamp);
  }, [highlightUtterances, currentHighlightIndex, previewMode, totalHighlights, setIsPlaying, seekToAndPlay]);

  const goToHighlightIndex = useCallback((index: number) => {
    if (highlightUtterances && index >= 0 && index < highlightUtterances.length) {
      setCurrentHighlightIndex(index);
      seekTo(highlightUtterances[index].startTimestamp);
    }
  }, [highlightUtterances, seekTo]);

  const togglePreviewMode = useCallback(() => {
    if (isPreviewDialogOpen) {
      setIsPreviewDialogOpen(false);
      setPreviewMode(false);
      setIsPlaying(false);
    } else {
      setIsPreviewDialogOpen(true);
      setPreviewMode(true);
      if (highlightUtterances && highlightUtterances.length > 0) {
        setCurrentHighlightIndex(0);
        seekToAndPlay(highlightUtterances[0].startTimestamp);
      }
    }
  }, [isPreviewDialogOpen, highlightUtterances, setIsPlaying, seekToAndPlay]);

  const openPreviewDialog = useCallback(() => {
    if (isPreviewDialogOpen) return;
    setIsPreviewDialogOpen(true);
    setPreviewMode(true);
    if (highlightUtterances && highlightUtterances.length > 0) {
      setCurrentHighlightIndex(0);
      setTimeout(() => {
        seekToAndPlay(highlightUtterances[0].startTimestamp);
      }, 100);
    }
  }, [isPreviewDialogOpen, highlightUtterances, seekToAndPlay]);

  const closePreviewDialog = useCallback(() => {
    if (!isPreviewDialogOpen) return;
    setIsPreviewDialogOpen(false);
    setPreviewMode(false);
    setIsPlaying(false);
  }, [isPreviewDialogOpen, setIsPlaying]);

  // Enter edit mode - called when switching to edit mode (from URL parameter)
  const enterEditMode = useCallback((highlight: HighlightWithUtterances) => {
    setEditingHighlight(highlight);
    // Store the original highlight for reset functionality
    setOriginalHighlight(highlight);
    setIsDirty(false); // Start with clean state
    // Clear range selection anchor
    setLastClickedUtteranceId(null);
    setLastClickedAction(null);

    // Auto-navigate to transcript page with highlight parameter if not already there
    const expectedPath = `/${highlight.cityId}/${highlight.meetingId}/transcript`;
    const expectedUrl = `${expectedPath}?highlight=${highlight.id}`;

    // Check if we're already on the transcript page
    if (pathname === expectedPath) {
      // We're on transcript page, just add/update the highlight parameter
      router.replace(`${expectedPath}?highlight=${highlight.id}`, { scroll: false });
    } else if (!pathname.includes('/transcript')) {
      // We're not on transcript page, navigate to it with highlight parameter
      router.push(expectedUrl, { scroll: false });
    }
  }, [setEditingHighlight, setOriginalHighlight, setIsDirty, router, pathname]);

  // Clean up highlight editing state when navigating away from transcript.
  // This is the mirror of the Transcript.tsx useEffect that enters edit mode
  // when arriving at /transcript?highlight=ID.
  useEffect(() => {
    if (editingHighlight && !pathname.includes('/transcript')) {
      setEditingHighlight(null);
      setOriginalHighlight(null);
      setIsDirty(false);
      setPreviewMode(false);
      setIsPlaying(false);
      setLastClickedUtteranceId(null);
      setLastClickedAction(null);
    }
  }, [pathname, editingHighlight, setIsPlaying]);

  // Check if editing should be disabled (e.g., during save operations)
  const isEditingDisabled = isSaving;

  // Update highlight utterances during editing
  const updateHighlightUtterances = useCallback((utteranceId: string, action: 'add' | 'remove', modifiers?: { shift: boolean }) => {
    if (!editingHighlight || isEditingDisabled) return;

    // Determine the effective action
    const effectiveAction = (modifiers?.shift && lastClickedUtteranceId && lastClickedAction)
      ? lastClickedAction
      : action;

    // Determine which utterances to operate on
    let utteranceIds: string[];
    if (modifiers?.shift && lastClickedUtteranceId) {
      // Range operation with Shift modifier
      const allUtterances = transcriptRef.current.flatMap(segment => segment.utterances);
      utteranceIds = calculateUtteranceRange(allUtterances, lastClickedUtteranceId, utteranceId);
    } else {
      // Single operation
      utteranceIds = [utteranceId];
      setLastClickedUtteranceId(utteranceId);
      setLastClickedAction(action);
    }

    if (effectiveAction === 'remove') {
      const updatedHighlight = {
        ...editingHighlight,
        highlightedUtterances: editingHighlight.highlightedUtterances.filter(
          hu => !utteranceIds.includes(hu.utteranceId)
        )
      };

      setEditingHighlight(updatedHighlight);
      setIsDirty(true);
    } else {
      // Add utterances to highlight
      const utteranceMap = buildUtteranceMap();
      const now = new Date();
      const newHighlightedUtterances = utteranceIds
        .filter(id => !editingHighlight.highlightedUtterances.some(hu => hu.utteranceId === id))
        .map(id => {
          const utterance = utteranceMap.get(id);
          if (!utterance) return null;

          return {
            id: `temp-${Date.now()}-${Math.random()}`,
            utteranceId: id,
            highlightId: editingHighlight.id,
            createdAt: now,
            updatedAt: now,
            utterance: utterance
          };
        })
        .filter((hu): hu is NonNullable<typeof hu> => hu !== null);

      if (newHighlightedUtterances.length > 0) {
        const updatedHighlight = {
          ...editingHighlight,
          highlightedUtterances: [
            ...editingHighlight.highlightedUtterances,
            ...newHighlightedUtterances
          ]
        };

        setEditingHighlight(updatedHighlight);
        setIsDirty(true);
      }
    }
  }, [editingHighlight, buildUtteranceMap, isEditingDisabled, lastClickedUtteranceId, lastClickedAction]);

  const resetToOriginal = useCallback(() => {
    if (originalHighlight) {
      setEditingHighlight(originalHighlight);
      setIsDirty(false);
      setLastClickedUtteranceId(null);
      setLastClickedAction(null);
    }
  }, [originalHighlight]);

  // Exit edit mode - navigate away; state cleanup happens in the pathname effect above
  const exitEditMode = useCallback(() => {
    if (!editingHighlight) return;
    setIsPlaying(false);
    router.push(`/${editingHighlight.cityId}/${editingHighlight.meetingId}/highlights`);
  }, [editingHighlight, router, setIsPlaying]);

  // Exit edit mode and redirect to individual highlight page
  const exitEditModeAndRedirectToHighlight = useCallback(() => {
    if (!editingHighlight) return;
    setIsPlaying(false);
    router.push(`/${editingHighlight.cityId}/${editingHighlight.meetingId}/highlights/${editingHighlight.id}`);
  }, [editingHighlight, router, setIsPlaying]);

  // Save highlight functionality
  const saveHighlight = useCallback(async (options?: {
    name?: string;
    subjectId?: string | null;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
  }) => {
    if (!editingHighlight) {
      return { success: false, error: 'No highlight to save' };
    }

    const hasChanges = isDirty || (options?.name !== undefined) || (options?.subjectId !== undefined);

    if (!hasChanges) {
      return { success: false, error: 'No changes to save' };
    }

    try {
      setIsSaving(true);

      const updateData = {
        name: options?.name ?? editingHighlight.name,
        meetingId: editingHighlight.meetingId,
        cityId: editingHighlight.cityId,
        utteranceIds: editingHighlight.highlightedUtterances.map(hu => hu.utteranceId),
        ...(options?.subjectId !== undefined && { subjectId: options.subjectId })
      };

      const res = await fetch(`/api/highlights/${editingHighlight.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to save');
      }

      const updatedHighlight = await res.json();

      setEditingHighlight(updatedHighlight);
      setOriginalHighlight(updatedHighlight);

      updateHighlight(editingHighlight.id, updatedHighlight);

      setIsDirty(false);
      options?.onSuccess?.();

      return { success: true };
    } catch (error) {
      console.error('Failed to save highlight:', error);
      options?.onError?.(error as Error);
      return { success: false, error };
    } finally {
      setIsSaving(false);
    }
  }, [editingHighlight, isDirty, updateHighlight]);

  // Create highlight functionality
  const createHighlight = useCallback(async (options: {
    preSelectedUtteranceId?: string;
    onSuccess?: (highlight: HighlightWithUtterances) => void;
    onError?: (error: Error) => void;
  }) => {
    const { preSelectedUtteranceId, onSuccess, onError } = options;

    try {
      setIsCreating(true);

      const utteranceIds = preSelectedUtteranceId ? [preSelectedUtteranceId] : [];

      const res = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: meeting.id,
          cityId: meeting.cityId,
          utteranceIds
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to create highlight');
      }

      const highlight = await res.json();

      addHighlight(highlight);
      enterEditMode(highlight);

      if (preSelectedUtteranceId) {
        setLastClickedUtteranceId(preSelectedUtteranceId);
        setLastClickedAction('add');
      }

      onSuccess?.(highlight);

      return { success: true };
    } catch (error) {
      console.error('Failed to create highlight:', error);
      onError?.(error as Error);
      return { success: false, error };
    } finally {
      setIsCreating(false);
    }
  }, [meeting, addHighlight, enterEditMode]);

  // Memoize value — changes on highlight-specific state, NOT on transcript edits.
  const value = useMemo(() => ({
    editingHighlight,
    previewMode,
    isPreviewDialogOpen,
    statistics,
    highlightUtterances,
    currentHighlightIndex,
    totalHighlights,
    hasUnsavedChanges: isDirty,
    isSaving,
    isCreating,
    isEditingDisabled,
    enterEditMode,
    updateHighlightUtterances,
    resetToOriginal,
    exitEditMode,
    exitEditModeAndRedirectToHighlight,
    goToPreviousHighlight,
    goToNextHighlight,
    goToHighlightIndex,
    togglePreviewMode,
    openPreviewDialog,
    closePreviewDialog,
    calculateHighlightData,
    saveHighlight,
    createHighlight,
  }), [
    editingHighlight, previewMode, isPreviewDialogOpen,
    statistics, highlightUtterances, currentHighlightIndex, totalHighlights,
    isDirty, isSaving, isCreating, isEditingDisabled,
    enterEditMode, updateHighlightUtterances, exitEditMode,
    exitEditModeAndRedirectToHighlight, calculateHighlightData,
    saveHighlight, createHighlight, resetToOriginal,
    goToPreviousHighlight, goToNextHighlight, goToHighlightIndex,
    togglePreviewMode, openPreviewDialog, closePreviewDialog,
  ]);

  return (
    <HighlightContext.Provider value={value}>
      {children}
    </HighlightContext.Provider>
  );
}

export function useHighlight() {
  const context = useContext(HighlightContext);
  if (context === undefined) {
    throw new Error('useHighlight must be used within a HighlightProvider');
  }
  return context;
}
