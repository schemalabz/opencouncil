"use client";
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { HighlightWithUtterances } from '@/lib/db/highlights';
import { useCouncilMeetingActions, useCouncilMeetingData } from './CouncilMeetingDataContext';
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

  // Get transcript and speaker data from CouncilMeetingDataContext
  const { transcript, speakerTags, getSpeakerTag, getPerson, getSpeakerSegmentById, meeting } = useCouncilMeetingData();
  // Mutations come from the stable actions context — they never change identity.
  const { addHighlight, updateHighlight } = useCouncilMeetingActions();
  const { currentTime, seekTo, isPlaying, setIsPlaying, seekToAndPlay } = useVideo();
  const router = useRouter();
  const pathname = usePathname();

  // Build utterance map and flat list once per transcript change. These are
  // accessed only inside callbacks (not in render output), so we mirror them
  // into refs to keep callback identities stable across transcript changes.
  const utteranceMap = useMemo(() => {
    const map = new Map<string, Utterance>();
    transcript.forEach(segment => {
      segment.utterances.forEach(utterance => {
        map.set(utterance.id, utterance);
      });
    });
    return map;
  }, [transcript]);

  const allUtterances = useMemo(() => {
    return transcript.flatMap(segment => segment.utterances);
  }, [transcript]);

  // Refs mirror state read inside stable callbacks. Render-time assignment
  // (vs useEffect) keeps reads consistent with the most recent committed
  // render and avoids the post-commit window in which an effect-synced ref
  // would observe stale data.
  const utteranceMapRef = useRef(utteranceMap);
  utteranceMapRef.current = utteranceMap;
  const allUtterancesRef = useRef(allUtterances);
  allUtterancesRef.current = allUtterances;
  const editingHighlightRef = useRef(editingHighlight);
  editingHighlightRef.current = editingHighlight;
  const lastClickedIdRef = useRef(lastClickedUtteranceId);
  lastClickedIdRef.current = lastClickedUtteranceId;
  const lastClickedActionRef = useRef(lastClickedAction);
  lastClickedActionRef.current = lastClickedAction;

  const calculateHighlightData = useCallback((highlight: HighlightWithUtterances | null): HighlightCalculationResult | null => {
    if (!highlight) {
      return null;
    }

    const map = utteranceMapRef.current;

    // Extract highlight utterances with timestamps and speaker information
    const utterances: HighlightUtterance[] = [];
    highlight.highlightedUtterances.forEach(hu => {
      const utterance = map.get(hu.utteranceId);
      if (utterance) {
        const segment = getSpeakerSegmentById(utterance.speakerSegmentId);
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
  }, [getSpeakerSegmentById, getSpeakerTag, getPerson]);

  // Recompute when the highlight changes, when the transcript changes
  // (`utteranceMap` proxies transcript identity, refreshing utterance text and
  // timestamps), or when speaker tags change (refreshes speaker names —
  // `calculateHighlightData` reads them through stable ref-backed getters, so
  // ESLint can't see them as deps).
  const editingHighlightData = useMemo(() => {
    return calculateHighlightData(editingHighlight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculateHighlightData, editingHighlight, utteranceMap, speakerTags]);

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
  }, [highlightUtterances, currentHighlightIndex, totalHighlights, previewMode, setIsPlaying, seekToAndPlay]);

  const goToHighlightIndex = useCallback((index: number) => {
    if (highlightUtterances && index >= 0 && index < highlightUtterances.length) {
      setCurrentHighlightIndex(index);
      seekTo(highlightUtterances[index].startTimestamp);
    }
  }, [highlightUtterances, seekTo]);

  // Enhanced preview mode toggle
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
    setOriginalHighlight(highlight);
    setIsDirty(false);
    setLastClickedUtteranceId(null);
    setLastClickedAction(null);

    const expectedPath = `/${highlight.cityId}/${highlight.meetingId}/transcript`;
    const expectedUrl = `${expectedPath}?highlight=${highlight.id}`;

    if (pathname === expectedPath) {
      router.replace(`${expectedPath}?highlight=${highlight.id}`, { scroll: false });
    } else if (!pathname.includes('/transcript')) {
      router.push(expectedUrl, { scroll: false });
    }
  }, [router, pathname]);

  // Clean up highlight editing state when navigating away from transcript.
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

  // Mirrored to a ref so updateHighlightUtterances can read it without
  // having isSaving as a callback dep.
  const isEditingDisabled = isSaving;
  const isEditingDisabledRef = useRef(isEditingDisabled);
  isEditingDisabledRef.current = isEditingDisabled;

  // Stable callback — reads state via refs so it has [] deps and never
  // changes identity. Computes the next highlight outside of any setState
  // updater so setIsDirty is not called from inside one (which would
  // double-fire under StrictMode).
  const updateHighlightUtterances = useCallback((utteranceId: string, action: 'add' | 'remove', modifiers?: { shift: boolean }) => {
    if (isEditingDisabledRef.current) return;
    const current = editingHighlightRef.current;
    if (!current) return;

    const lastClicked = lastClickedIdRef.current;
    const lastAction = lastClickedActionRef.current;

    const effectiveAction = (modifiers?.shift && lastClicked && lastAction)
      ? lastAction
      : action;

    let utteranceIds: string[];
    if (modifiers?.shift && lastClicked) {
      utteranceIds = calculateUtteranceRange(allUtterancesRef.current, lastClicked, utteranceId);
    } else {
      utteranceIds = [utteranceId];
      setLastClickedUtteranceId(utteranceId);
      setLastClickedAction(action);
    }

    let updated: HighlightWithUtterances;
    if (effectiveAction === 'remove') {
      updated = {
        ...current,
        highlightedUtterances: current.highlightedUtterances.filter(
          hu => !utteranceIds.includes(hu.utteranceId)
        )
      };
    } else {
      const map = utteranceMapRef.current;
      const now = new Date();
      const newHighlightedUtterances = utteranceIds
        .filter(id => !current.highlightedUtterances.some(hu => hu.utteranceId === id))
        .map(id => {
          const utterance = map.get(id);
          if (!utterance) return null;
          return {
            id: `temp-${Date.now()}-${Math.random()}`,
            utteranceId: id,
            highlightId: current.id,
            createdAt: now,
            updatedAt: now,
            utterance,
          };
        })
        .filter((hu): hu is NonNullable<typeof hu> => hu !== null);

      if (newHighlightedUtterances.length === 0) return;

      updated = {
        ...current,
        highlightedUtterances: [
          ...current.highlightedUtterances,
          ...newHighlightedUtterances,
        ],
      };
    }

    setEditingHighlight(updated);
    setIsDirty(true);
  }, []);

  const resetToOriginal = useCallback(() => {
    if (originalHighlight) {
      setEditingHighlight(originalHighlight);
      setIsDirty(false);
      setLastClickedUtteranceId(null);
      setLastClickedAction(null);
    }
  }, [originalHighlight]);

  const exitEditMode = useCallback(() => {
    if (!editingHighlight) return;
    setIsPlaying(false);
    router.push(`/${editingHighlight.cityId}/${editingHighlight.meetingId}/highlights`);
  }, [editingHighlight, router, setIsPlaying]);

  const exitEditModeAndRedirectToHighlight = useCallback(() => {
    if (!editingHighlight) return;
    setIsPlaying(false);
    router.push(`/${editingHighlight.cityId}/${editingHighlight.meetingId}/highlights/${editingHighlight.id}`);
  }, [editingHighlight, router, setIsPlaying]);

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

  // When no highlight is being edited, every dep below is stable across
  // transcript edits, so useHighlight() consumers (every Utterance) bail
  // via memoization. While a highlight IS being edited, statistics and
  // highlightUtterances correctly update via editingHighlightData →
  // utteranceMap.
  const value = useMemo<HighlightContextType>(() => ({
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
    editingHighlight,
    previewMode,
    isPreviewDialogOpen,
    statistics,
    highlightUtterances,
    currentHighlightIndex,
    totalHighlights,
    isDirty,
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
