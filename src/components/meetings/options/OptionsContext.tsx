"use client";
import React, { createContext, useContext, useState } from 'react';
import { SpeakerTag } from '@prisma/client';

export interface TranscriptOptions {
    editable: boolean;
    editsAllowed: boolean;
    selectedSpeakerTag: SpeakerTag["id"] | null;
    highlightLowConfidenceWords: boolean;
    maxUtteranceDrift: number;
    playbackSpeed: number;
    skipInterval: number; // seconds to skip forward/backward
}

interface TranscriptOptionsContextType {
    options: TranscriptOptions;
    updateOptions: (newOptions: Partial<TranscriptOptions>) => void;
}

const TranscriptOptionsContext = createContext<TranscriptOptionsContextType | undefined>(undefined);

const defaultOptions: TranscriptOptions = {
    editsAllowed: false,
    editable: false,
    selectedSpeakerTag: null,
    highlightLowConfidenceWords: true,
    maxUtteranceDrift: 500,
    playbackSpeed: 1,
    skipInterval: 5 // default to 5 seconds
};

function useTranscriptOptionsProvider(initialOptions: TranscriptOptions) {
    const [options, setOptions] = useState<TranscriptOptions>(initialOptions);

    const updateOptions = (newOptions: Partial<TranscriptOptions>) => {
        setOptions(prev => ({ ...prev, ...newOptions }));
    };

    return { options, updateOptions };
}

export function TranscriptOptionsProvider({ children, editable }: { children: React.ReactNode, editable: boolean }) {
    const { options, updateOptions } = useTranscriptOptionsProvider({ ...defaultOptions, editsAllowed: editable });

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