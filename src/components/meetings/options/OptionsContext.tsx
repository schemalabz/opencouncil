"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

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

/** The last chosen speed, surviving navigations — clamped to the player's range. */
function storedPlaybackSpeed(): number {
    try {
        const value = parseFloat(window.localStorage.getItem(SPEED_STORAGE_KEY) ?? '');
        if (Number.isFinite(value)) return Math.min(4, Math.max(0.5, value));
    } catch { /* storage may be unavailable */ }
    return 1;
}

const defaultOptions: Omit<TranscriptOptions, 'playbackSpeed'> = {
    editsAllowed: false,
    editable: false,
    canCreateHighlights: false,
    maxUtteranceDrift: 500,
    skipInterval: 5,
};

export function TranscriptOptionsProvider({ children, editable, canCreateHighlights }: { children: React.ReactNode, editable: boolean, canCreateHighlights: boolean }) {
    const [options, setOptions] = useState<TranscriptOptions>(() => ({
        ...defaultOptions,
        editsAllowed: editable,
        canCreateHighlights,
        playbackSpeed: 1,
    }));

    // The stored speed loads after mount: reading localStorage during the
    // initial render makes the server HTML and the hydration render disagree
    // for anyone whose stored speed is not 1.
    useEffect(() => {
        const stored = storedPlaybackSpeed();
        if (stored !== 1) setOptions(prev => ({ ...prev, playbackSpeed: stored }));
    }, []);

    const value = useMemo<TranscriptOptionsContextType>(() => ({
        options,
        updateOptions: newOptions => {
            if (newOptions.playbackSpeed !== undefined) {
                try { window.localStorage.setItem(SPEED_STORAGE_KEY, String(newOptions.playbackSpeed)); } catch { /* ignore */ }
            }
            setOptions(prev => ({ ...prev, ...newOptions }));
        },
    }), [options]);

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
