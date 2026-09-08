"use client";
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useStoredState } from '@/hooks/useStoredState';

export interface TranscriptOptions {
    editable: boolean;
    editsAllowed: boolean;
    canCreateHighlights: boolean;
    maxUtteranceDrift: number;
    playbackSpeed: number;
    skipInterval: number; // seconds to skip forward/backward
}

interface TranscriptOptionsContextType {
    options: TranscriptOptions;
    updateOptions: (newOptions: Partial<TranscriptOptions>) => void;
}

const TranscriptOptionsContext = createContext<TranscriptOptionsContextType | undefined>(undefined);

const SPEED_STORAGE_KEY = 'oc-playback-speed';

/** The last chosen speed, clamped to the player's range. */
function parseStoredSpeed(raw: string): number | undefined {
    const value = parseFloat(raw);
    return Number.isFinite(value) ? Math.min(4, Math.max(0.5, value)) : undefined;
}

const defaultOptions: Omit<TranscriptOptions, 'playbackSpeed'> = {
    editsAllowed: false,
    editable: false,
    canCreateHighlights: false,
    maxUtteranceDrift: 500,
    skipInterval: 5,
};

export function TranscriptOptionsProvider({ children, editable, canCreateHighlights }: { children: React.ReactNode, editable: boolean, canCreateHighlights: boolean }) {
    const [options, setOptions] = useState<Omit<TranscriptOptions, 'playbackSpeed'>>(() => ({
        ...defaultOptions,
        editsAllowed: editable,
        canCreateHighlights,
    }));
    // The one option that outlives the page, so it is the one option that is stored.
    const [playbackSpeed, setPlaybackSpeed] = useStoredState(SPEED_STORAGE_KEY, parseStoredSpeed, 1);

    const value = useMemo<TranscriptOptionsContextType>(() => ({
        options: { ...options, playbackSpeed },
        updateOptions: newOptions => {
            const { playbackSpeed: speed, ...rest } = newOptions;
            if (speed !== undefined) setPlaybackSpeed(speed);
            if (Object.keys(rest).length > 0) setOptions(prev => ({ ...prev, ...rest }));
        },
    }), [options, playbackSpeed, setPlaybackSpeed]);

    return (
        <TranscriptOptionsContext.Provider value={value}>
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
