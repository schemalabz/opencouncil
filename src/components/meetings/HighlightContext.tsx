"use client";
import React, { createContext, useContext, useState, useMemo } from 'react';
import { HighlightWithUtterances } from '@/lib/db/highlights';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';

interface HighlightUtterance {
  id: string;
  text: string;
  startTimestamp: number;
  endTimestamp: number;
  speakerSegmentId: string;
  speakerName: string;
}

interface HighlightStatistics {
  duration: number;
  utteranceCount: number;
  speakerCount: number;
}

interface HighlightContextType {
  editingHighlight: HighlightWithUtterances | null;
  previewMode: boolean;
  statistics: HighlightStatistics | null;
  highlightUtterances: HighlightUtterance[] | null;
  setEditingHighlight: (highlight: HighlightWithUtterances | null) => void;
  setPreviewMode: (mode: boolean) => void;
}

const HighlightContext = createContext<HighlightContextType | undefined>(undefined);

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const [editingHighlight, setEditingHighlight] = useState<HighlightWithUtterances | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  
  // Get transcript and speaker data from CouncilMeetingDataContext
  const { transcript, getPerson, getSpeakerTag } = useCouncilMeetingData();

  // Calculate statistics and extract utterance data when editing highlight changes
  const { statistics, highlightUtterances } = useMemo(() => {
    if (!editingHighlight || !transcript) {
      return { statistics: null, highlightUtterances: null };
    }

    // Build utterance map for this calculation
    const utteranceMap = new Map();
    transcript.forEach(segment => {
      segment.utterances.forEach(utterance => {
        utteranceMap.set(utterance.id, utterance);
      });
    });

    // Extract highlight utterances with timestamps and speaker information
    const utterances: HighlightUtterance[] = [];
    editingHighlight.highlightedUtterances.forEach(hu => {
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
    
    const duration = utterances.reduce((total, utterance) => {
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
    // We only need to re-calculate when the editingHighlight changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingHighlight?.id, editingHighlight?.highlightedUtterances.length]);


  const value = {
    editingHighlight,
    previewMode,
    statistics,
    highlightUtterances,
    setEditingHighlight,
    setPreviewMode,
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