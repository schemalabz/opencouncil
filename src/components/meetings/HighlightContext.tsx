"use client";
import React, { createContext, useContext, useState } from 'react';
import { HighlightWithUtterances } from '@/lib/db/highlights';

interface HighlightContextType {
  editingHighlight: HighlightWithUtterances | null;
  previewMode: boolean;
  setEditingHighlight: (highlight: HighlightWithUtterances | null) => void;
  setPreviewMode: (mode: boolean) => void;
}

const HighlightContext = createContext<HighlightContextType | undefined>(undefined);

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const [editingHighlight, setEditingHighlight] = useState<HighlightWithUtterances | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const value = {
    editingHighlight,
    previewMode,
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