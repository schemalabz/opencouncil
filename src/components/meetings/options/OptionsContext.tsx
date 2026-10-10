"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useStoredState } from '@/hooks/useStoredState';

export interface TranscriptOptions {
    editable: boolean;
    editsAllowed: boolean;
    canCreateHighlights: boolean;
    maxUtteranceDrift: number;
    skipInterval: number; // seconds to skip forward/backward
}

interface TranscriptOptionsContextType {
    options: TranscriptOptions;
    updateOptions: (newOptions: Partial<TranscriptOptions>) => void;
}

const TranscriptOptionsContext = createContext<TranscriptOptionsContextType | undefined>(undefined);

interface PlaybackSpeedContextType {
    playbackSpeed: number;
    setPlaybackSpeed: (speed: number) => void;
}

// Speed travels in a context of its own. Every utterance and every segment
// header reads the options context, and a context change re-renders each
// reader whatever React.memo says, so a value that changes on every arrow
// press cannot share their context: on a 4,800-utterance meeting that cost
// 740 to 870 ms per key press.
const PlaybackSpeedContext = createContext<PlaybackSpeedContextType | undefined>(undefined);

const SPEED_STORAGE_KEY = 'oc-playback-speed';

/** The last chosen speed, clamped to the player's range. */
function parseStoredSpeed(raw: string): number | undefined {
    const value = parseFloat(raw);
    return Number.isFinite(value) ? Math.min(4, Math.max(0.5, value)) : undefined;
}

const defaultOptions: TranscriptOptions = {
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
    }));
    // The one option that outlives the page, so it is the one option that is stored.
    const [playbackSpeed, setPlaybackSpeed] = useStoredState(SPEED_STORAGE_KEY, parseStoredSpeed, 1);

    const updateOptions = useCallback((newOptions: Partial<TranscriptOptions>) => {
        setOptions(prev => ({ ...prev, ...newOptions }));
    }, []);

    const value = useMemo<TranscriptOptionsContextType>(() => ({ options, updateOptions }), [options, updateOptions]);
    const speedValue = useMemo<PlaybackSpeedContextType>(() => ({ playbackSpeed, setPlaybackSpeed }), [playbackSpeed, setPlaybackSpeed]);

    return (
        <TranscriptOptionsContext.Provider value={value}>
            <PlaybackSpeedContext.Provider value={speedValue}>
                {children}
            </PlaybackSpeedContext.Provider>
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

export function usePlaybackSpeed() {
    const context = useContext(PlaybackSpeedContext);
    if (context === undefined) {
        throw new Error('usePlaybackSpeed must be used within a TranscriptOptionsProvider');
    }
    return context;
}
