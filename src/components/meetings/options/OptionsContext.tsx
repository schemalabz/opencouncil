"use client";
import React, { createContext, useContext, useState, useEffect } from 'react';
import { SpeakerTag } from '@prisma/client';

export interface TranscriptOptions {
    editable: boolean;
    selectedSpeakerTag: SpeakerTag["id"] | null;
    highlightLowConfidenceWords: boolean;
    maxUtteranceDrift: number;
}

interface TranscriptOptionsContextType {
    options: TranscriptOptions;
    updateOptions: (newOptions: Partial<TranscriptOptions>) => void;
}

const TranscriptOptionsContext = createContext<TranscriptOptionsContextType | undefined>(undefined);

const defaultOptions: TranscriptOptions = {
    editable: true,
    selectedSpeakerTag: null,
    highlightLowConfidenceWords: true,
    maxUtteranceDrift: 100
};

function useTranscriptOptionsProvider(initialOptions: TranscriptOptions) {
    const [options, setOptions] = useState<TranscriptOptions>(initialOptions);

    const updateOptions = (newOptions: Partial<TranscriptOptions>) => {
        setOptions(prev => ({ ...prev, ...newOptions }));
    };

    return { options, updateOptions };
}

export function TranscriptOptionsProvider({ children }: { children: React.ReactNode }) {
    const { options, updateOptions } = useTranscriptOptionsProvider(defaultOptions);

    return (
        <TranscriptOptionsContext.Provider value={{ options, updateOptions }}>
            {children}
        </TranscriptOptionsContext.Provider>
    );
}

export function useTranscriptOptions() {
    const context = useContext(TranscriptOptionsContext);
    if (context === undefined) {
        throw new Error('useTranscriptOptions must be used within a TranscriptOptionsProvider');
    }
    return context;
}