"use client";
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { HighlightWithUtterances } from '@/lib/db/highlights';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { useVideo } from './VideoProvider';

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
  statistics: HighlightStatistics | null;
  highlightUtterances: HighlightUtterance[] | null;
  currentHighlightIndex: number;
  totalHighlights: number;
  utteranceMap: Map<string, any>; // Pre-built utterance map for performance
  setEditingHighlight: (highlight: HighlightWithUtterances | null) => void;
  setPreviewMode: (mode: boolean) => void;
  goToPreviousHighlight: () => void;
  goToNextHighlight: () => void;
  goToHighlightIndex: (index: number) => void;
  togglePreviewMode: () => void;
  calculateHighlightData: (highlight: HighlightWithUtterances | null) => HighlightCalculationResult | null;
}

const HighlightContext = createContext<HighlightContextType | undefined>(undefined);

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const [editingHighlight, setEditingHighlight] = useState<HighlightWithUtterances | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [currentHighlightIndex, setCurrentHighlightIndex] = useState(0);
  
  // Get transcript and speaker data from CouncilMeetingDataContext
  const { transcript, getSpeakerTag, getPerson } = useCouncilMeetingData();
  const { currentTime, seekTo, isPlaying, setIsPlaying, seekToAndPlay } = useVideo();

  // Build utterance map once and memoize it - this eliminates the need to rebuild it in useHighlightCalculations
  const utteranceMap = useMemo(() => {
    const map = new Map();
    transcript.forEach(segment => {
      segment.utterances.forEach(utterance => {
        map.set(utterance.id, utterance);
      });
    });
    return map;
  }, [transcript]);

  const calculateHighlightData = useCallback((highlight: HighlightWithUtterances | null): HighlightCalculationResult | null => {
      if (!highlight || !transcript) {
        return null;
      }

      // Extract highlight utterances with timestamps and speaker information
      const utterances: HighlightUtterance[] = [];
      highlight.highlightedUtterances.forEach(hu => {
        const utterance = utteranceMap.get(hu.utteranceId);
        if (utterance) {
          const segment = transcript.find(s => s.id === utterance.speakerSegmentId);
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
    }, [transcript, utteranceMap, getSpeakerTag, getPerson]);

  // Calculate data for the currently editing highlight
  const editingHighlightData = useMemo(() => {
    return calculateHighlightData(editingHighlight);
  }, [calculateHighlightData, editingHighlight]);

  const statistics = editingHighlightData?.statistics || null;
  const highlightUtterances = editingHighlightData?.highlightUtterances || null;

  // Calculate total highlights
  const totalHighlights = highlightUtterances?.length || 0;

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
    
    const currentUtterance = highlightUtterances[currentHighlightIndex];
    if (!currentUtterance) return;
    
    if (currentTime >= currentUtterance.endTimestamp) {
      // Auto-advance to next highlight
      const nextIndex = (currentHighlightIndex + 1) % totalHighlights;
      setCurrentHighlightIndex(nextIndex);
      seekTo(highlightUtterances[nextIndex].startTimestamp);
    }
  }, [currentTime, previewMode, highlightUtterances, currentHighlightIndex, isPlaying, totalHighlights, seekTo]);

  // Enhanced navigation functions
  const goToPreviousHighlight = () => {
    if (!highlightUtterances || highlightUtterances.length === 0) return;
    
    let newIndex: number;
    
    if (currentHighlightIndex > 0) {
      newIndex = currentHighlightIndex - 1;
    } else if (previewMode) {
      // In preview mode, loop to last highlight
      newIndex = totalHighlights - 1;
    } else {
      // In edit mode, stay at first highlight
      return;
    }
    
    setIsPlaying(false);
    setCurrentHighlightIndex(newIndex);
    seekToAndPlay(highlightUtterances[newIndex].startTimestamp);
  };

  const goToNextHighlight = () => {
    if (!highlightUtterances || highlightUtterances.length === 0) return;
    
    let newIndex: number;
    
    if (currentHighlightIndex < totalHighlights - 1) {
      newIndex = currentHighlightIndex + 1;
    } else if (previewMode) {
      // In preview mode, loop back to first highlight
      newIndex = 0;
    } else {
      // In edit mode, stay at last highlight
      return;
    }
    
    setIsPlaying(false);
    setCurrentHighlightIndex(newIndex);
    seekToAndPlay(highlightUtterances[newIndex].startTimestamp);
  };

  const goToHighlightIndex = (index: number) => {
    if (highlightUtterances && index >= 0 && index < highlightUtterances.length) {
      setCurrentHighlightIndex(index);
      seekTo(highlightUtterances[index].startTimestamp);
    }
  };

  // Enhanced preview mode toggle
  const togglePreviewMode = () => {
    const newPreviewMode = !previewMode;
    setPreviewMode(newPreviewMode);
    
    // When entering preview mode, jump to first highlight if available
    if (newPreviewMode && highlightUtterances && highlightUtterances.length > 0) {
      setCurrentHighlightIndex(0);
      seekTo(highlightUtterances[0].startTimestamp);
    }
  };

  const value = {
    editingHighlight,
    previewMode,
    statistics,
    highlightUtterances,
    currentHighlightIndex,
    totalHighlights,
    utteranceMap,
    setEditingHighlight,
    setPreviewMode,
    goToPreviousHighlight,
    goToNextHighlight,
    goToHighlightIndex,
    togglePreviewMode,
    calculateHighlightData,
  };

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