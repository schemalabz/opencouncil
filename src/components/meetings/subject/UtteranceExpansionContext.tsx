"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface UtteranceExpansionContextType {
  toggleExpansion: (utteranceId: string) => void;
  isExpanded: (utteranceId: string) => boolean;
}

const UtteranceExpansionContext = createContext<UtteranceExpansionContextType | undefined>(
  undefined
);

export function UtteranceExpansionProvider({ children }: { children: ReactNode }) {
  const [expandedUtterances, setExpandedUtterances] = useState<Set<string>>(new Set());

  const toggleExpansion = useCallback((utteranceId: string) => {
    setExpandedUtterances((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(utteranceId)) {
        newSet.delete(utteranceId);
      } else {
        newSet.add(utteranceId);
      }
      return newSet;
    });
  }, []);

  const isExpanded = useCallback(
    (utteranceId: string) => expandedUtterances.has(utteranceId),
    [expandedUtterances]
  );

  return (
    <UtteranceExpansionContext.Provider
      value={{ toggleExpansion, isExpanded }}
    >
      {children}
    </UtteranceExpansionContext.Provider>
  );
}

export function useUtteranceExpansion() {
  const context = useContext(UtteranceExpansionContext);
  if (!context) {
    throw new Error(
      "useUtteranceExpansion must be used within UtteranceExpansionProvider"
    );
  }
  return context;
}
