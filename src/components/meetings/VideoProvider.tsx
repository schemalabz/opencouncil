"use client"
import React, { createContext, useContext, useState, useRef, useEffect, SyntheticEvent, useCallback, useMemo } from 'react';
import { CouncilMeeting, Utterance as UtteranceType } from "@prisma/client";
import { useTranscriptOptions } from './options/OptionsContext';

/**
 * VIDEO PLAYBACK ARCHITECTURE OVERVIEW:
 * 
 * The video playback system works as follows:
 * 
 * 1. VIDEO ELEMENT (MuxVideo in Video.tsx):
 *    - The actual HTML5 video element that plays the media
 *    - Fires native HTML5 video events: onTimeUpdate, onSeeked, onSeeking
 *    - Playback is controlled via native methods: play(), pause(), setting currentTime
 * 
 * 2. VIDEO PROVIDER (this component):
 *    - Manages video state (isPlaying, currentTime, duration)
 *    - Provides playback controls (play, pause, seek)
 *    - Handles time synchronization with transcript
 * 
 * 3. PLAYBACK FLOW:
 *    - User clicks play → togglePlayPause() → playVideo() → video.play()
 *    - Video plays continuously → onTimeUpdate fires ~60fps → handleTimeUpdate() → throttledSetCurrentTime()
 *    - This updates currentTime state which triggers UI updates
 * 
 */

interface VideoContextType {
    isPlaying: boolean;
    currentTime: number;
    currentTimeRef: React.MutableRefObject<number>;
    duration: number;
    setCurrentScrollInterval: (interval: [number, number]) => void;
    currentScrollInterval: [number, number];
    playbackSpeed: string;
    togglePlayPause: () => void;
    handleSpeedChange: (value: string) => void;
    seekTo: (time: number) => void;
    seekToWithoutScroll: (time: number) => void;
    seekToAndPlay: (time: number) => void;
    scrollToUtterance: (time: number) => void;
    playerRef: React.MutableRefObject<HTMLVideoElement | null>;
    isSeeking: boolean;
    setIsPlaying: (isPlaying: boolean) => void;
    meeting: CouncilMeeting;
    onTimeUpdate: (time: SyntheticEvent<HTMLVideoElement, Event>) => void;
    onSeeked: () => void;
    onSeeking: () => void;
}

const VideoContext = createContext<VideoContextType | undefined>(undefined);

/**
 * Stable context for actions/refs that don't change during playback.
 * Components using this context (like Utterance) won't re-render when
 * currentTime updates. Functions are ref-wrapped so the value object
 * is created once and never changes.
 */
interface VideoActionsContextType {
    currentTimeRef: React.MutableRefObject<number>;
    seekTo: (time: number) => void;
    seekToWithoutScroll: (time: number) => void;
    togglePlayPause: () => void;
}

const VideoActionsContext = createContext<VideoActionsContextType | undefined>(undefined);

export const useVideo = () => {
    const context = useContext(VideoContext);
    if (!context) {
        throw new Error('useVideo must be used within a VideoProvider');
    }
    return context;
};

/**
 * Use this instead of useVideo() in components that don't need reactive
 * currentTime/isPlaying state (e.g., Utterance). This prevents re-renders
 * during video playback.
 */
export const useVideoActions = () => {
    const context = useContext(VideoActionsContext);
    if (!context) {
        throw new Error('useVideoActions must be used within a VideoProvider');
    }
    return context;
};

interface VideoProviderProps {
    children: React.ReactNode;
    meeting: CouncilMeeting;
    utterances: UtteranceType[];
}

// Add throttle helper function
const throttle = (func: Function, limit: number) => {
    let inThrottle: boolean;
    return function (this: any, ...args: any[]) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

export const VideoProvider: React.FC<VideoProviderProps> = ({ children, meeting, utterances }) => {
    const { options } = useTranscriptOptions();
    
    // === CORE VIDEO STATE ===
    const [isPlaying, setIsPlaying] = useState(false); // React state for UI updates
    const currentTimeRef = useRef(0); // Ref for immediate access without re-renders
    const [duration, setDuration] = useState(0); // Total video duration
    const [playbackSpeed, setPlaybackSpeed] = useState(options.playbackSpeed.toString());
    const [isSeeking, setIsSeeking] = useState(false); // True when user is dragging timeline
    const [hasStartedPlaying, setHasStartedPlaying] = useState(false); // First play flag
    const playerRef = useRef<HTMLVideoElement | null>(null); // Direct reference to video element
    const [currentTime, setCurrentTime] = useState(0); // React state for UI (throttled updates)

    // Scroll to the last utterance before the seek time or the first utterance if none before
    const scrollToUtterance = useCallback((time: number) => {
        const lastUtteranceBeforeTime = utterances
            .filter(u => u.startTimestamp <= time)
            .sort((a, b) => b.startTimestamp - a.startTimestamp)[0];

        const utteranceToScrollTo = lastUtteranceBeforeTime || utterances[0];

        if (utteranceToScrollTo) {
            const utteranceElement = document.getElementById(utteranceToScrollTo.id);
            if (utteranceElement) {
                utteranceElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [utterances]);

    // === VIDEO METADATA SETUP ===
    useEffect(() => {
        const player = playerRef.current;
        const updateDuration = () => {
            if (player && !isNaN(player.duration)) {
                setDuration(player.duration);
            }
        };

        // Listen for when video metadata is loaded to get duration
        player?.addEventListener('loadedmetadata', updateDuration);
        updateDuration();

        return () => {
            player?.removeEventListener('loadedmetadata', updateDuration);
        };
    }, [utterances]);

    // === URL PARAMETER HANDLING ===
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const timeParam = urlParams.get('t');

        // Set initial time to first utterance if no other time set
        if (currentTimeRef.current === 0 && utterances.length > 0) {
            currentTimeRef.current = utterances[0].startTimestamp;
        }

        // Handle ?t=123 URL parameter for deep linking
        if (timeParam) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds) && playerRef.current) {
                currentTimeRef.current = seconds;
                // Add a longer delay and retry mechanism for scrolling
                const scrollAttempt = (attemptsLeft: number) => {
                    setTimeout(() => {
                        const utteranceElement = utterances
                            .filter(u => u.startTimestamp <= seconds)
                            .sort((a, b) => b.startTimestamp - a.startTimestamp)[0];

                        if (utteranceElement) {
                            const element = document.getElementById(utteranceElement.id);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            } else if (attemptsLeft > 0) {
                                // If element not found, retry with one less attempt
                                scrollAttempt(attemptsLeft - 1);
                            }
                        }
                    }, 500);
                };

                scrollAttempt(3); // Try up to 3 times
            }
        }
    }, [utterances]);

    // === PLAYBACK SPEED SYNC ===
    useEffect(() => {
        if (playerRef.current) {
            playerRef.current.playbackRate = options.playbackSpeed;
        }
    }, [options.playbackSpeed]);

    // === CORE PLAYBACK CONTROLS ===
    
    /**
     * PLAY FUNCTION:
     * - Calls native video.play() method
     * - Sets initial time position on first play
     * - Updates isPlaying state for UI
     */
    const playVideo = async () => {
        if (playerRef.current) {
            await playerRef.current.play();
            if (!hasStartedPlaying) { // this is the first time we play
                playerRef.current.currentTime = currentTimeRef.current;
                setHasStartedPlaying(true);
            }
            setIsPlaying(true);

        }
    };

    /**
     * PAUSE FUNCTION:
     * - Calls native video.pause() method
     * - Updates isPlaying state for UI
     */
    const pauseVideo = async () => {
        if (playerRef.current) {
            await playerRef.current.pause();
            setIsPlaying(false);
        }
    };

    /**
     * TOGGLE PLAY/PAUSE:
     * - Main control function called by UI buttons
     * - Switches between play and pause states
     */
    const togglePlayPause = async () => {
        try {
            if (isPlaying) {
                await pauseVideo();
            } else {
                await playVideo();
            }
        } catch (error) {
            console.error('Error in togglePlayPause:', error);
            setIsPlaying(false);
        }
    };

    // === SEEKING CONTROL ===
    
    /**
     * SEEKING EVENT HANDLERS:
     * - onSeeking: Fired when user starts dragging timeline
     * - onSeeked: Fired when user finishes dragging timeline
     * - These prevent time updates during user interaction
     */
    const handleSeeking = async () => {
        setIsSeeking(true);
    }

    const handleSeeked = async () => {
        setIsSeeking(false);
        if (playerRef.current) {
            currentTimeRef.current = playerRef.current.currentTime;
        }
    }
    
    const handleSpeedChange = (value: string) => {
        setPlaybackSpeed(value);
        if (playerRef.current) {
            playerRef.current.playbackRate = parseFloat(value);
        }
    };

    /**
     * SEEK TO TIME:
     * - Sets video currentTime to specific timestamp
     * - Updates internal time reference
     * - Scrolls transcript to corresponding utterance
     */
    const seekTo = (time: number) => {
        if (playerRef.current) {
            if (hasStartedPlaying) {
                playerRef.current.currentTime = time;
            }
            currentTimeRef.current = time;
            setCurrentTime(time);
            updateHighlightOnce();
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                scrollToUtterance(time);
            });
        }
    };

    /**
     * TIME UPDATE HANDLER:
     * - Called ~60fps while video is playing (native HTML5 event)
     * - Updates currentTimeRef for immediate access
     * - Throttles UI state updates to reduce re-renders
     */
    const handleTimeUpdate = useCallback(() => {
        if (playerRef.current && !isSeeking) {
            if (isPlaying) {
                const newTime = playerRef.current.currentTime;
                currentTimeRef.current = newTime;
                // Only update state periodically to reduce rerenders
                throttledSetCurrentTime(newTime);
            }
        }
        // throttledSetCurrentTime is intentionally excluded from dependencies because:
        // 1. It's created with useRef, making it stable across renders
        // 2. Adding it to dependencies would be redundant since it never changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSeeking, isPlaying]);

    /**
     * THROTTLED TIME UPDATE:
     * - Reduces UI re-renders by limiting setCurrentTime calls
     */
    const throttledSetCurrentTime = useRef(
        throttle((time: number) => {
            setCurrentTime(time);
        }, 2000) // Update at most every 2s — DOM highlighting runs imperatively via <style>, so React state updates are only needed for UI controls
    ).current;

    const seekToAndPlay = (time: number) => {
        seekTo(time);
        playVideo();
    }

    const [currentScrollInterval, setCurrentScrollInterval] = useState<[number, number]>([0, 0]);

    // === DOM-BASED ACTIVE UTTERANCE HIGHLIGHTING ===
    // Uses rAF during playback for smooth 60fps highlighting without React re-renders.
    // Runs a single update on seek/pause for immediate feedback.
    const styleRef = useRef<HTMLStyleElement | null>(null);
    const activeUtteranceIdRef = useRef<string | null>(null);

    // Pre-computed Map for O(1) utterance lookup by second
    const utteranceBySecond = useMemo(() => {
        const map = new Map<number, UtteranceType>();
        for (const u of utterances) {
            for (let s = Math.floor(u.startTimestamp); s <= Math.floor(u.endTimestamp); s++) {
                map.set(s, u);
            }
        }
        return map;
    }, [utterances]);

    const updateHighlightOnce = useCallback(() => {
        const time = currentTimeRef.current;

        const candidate = utteranceBySecond.get(Math.floor(time));
        const activeUtterance = candidate && candidate.startTimestamp <= time && candidate.endTimestamp >= time
            ? candidate : null;

        const newActiveId = activeUtterance?.id ?? null;

        if (newActiveId !== activeUtteranceIdRef.current) {
            activeUtteranceIdRef.current = newActiveId;
            if (styleRef.current) {
                styleRef.current.textContent = newActiveId
                    ? `#${CSS.escape(newActiveId)} { background: hsl(var(--accent)); }`
                    : '';
            }
        }
    }, [utteranceBySecond]);

    // Create/cleanup the <style> element
    useEffect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-utterance-highlight', '');
        document.head.appendChild(style);
        styleRef.current = style;
        return () => {
            style.remove();
            styleRef.current = null;
        };
    }, []);

    // rAF loop: only runs while playing
    useEffect(() => {
        if (!isPlaying) {
            updateHighlightOnce();
            return;
        }

        let rafId: number;
        const loop = () => {
            updateHighlightOnce();
            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(rafId);
    }, [isPlaying, updateHighlightOnce]);

    /**
     * SEEK WITHOUT SCROLL:
     * - Seeks to time without triggering transcript scroll
     * - Used for programmatic seeking
     */
    const seekToWithoutScroll = (time: number) => {
        if (playerRef.current) {
            if (hasStartedPlaying) {
                playerRef.current.currentTime = time;
            }
            currentTimeRef.current = time;
            setCurrentTime(time);
            updateHighlightOnce();
        }
    };

    // === STABLE ACTIONS CONTEXT ===
    // Store action functions in refs so the memoized actions value never changes.
    // This prevents Utterance components from re-rendering during playback.
    const seekToRef = useRef(seekTo);
    seekToRef.current = seekTo;
    const seekToWithoutScrollRef = useRef(seekToWithoutScroll);
    seekToWithoutScrollRef.current = seekToWithoutScroll;
    const togglePlayPauseRef = useRef(togglePlayPause);
    togglePlayPauseRef.current = togglePlayPause;

    const actionsValue = useMemo<VideoActionsContextType>(() => ({
        currentTimeRef,
        seekTo: (time: number) => seekToRef.current(time),
        seekToWithoutScroll: (time: number) => seekToWithoutScrollRef.current(time),
        togglePlayPause: () => togglePlayPauseRef.current(),
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    const value = {
        isPlaying,
        currentTime: currentTimeRef.current,
        currentTimeRef,
        duration,
        playbackSpeed,
        currentScrollInterval,
        setCurrentScrollInterval,
        togglePlayPause,
        handleSpeedChange,
        seekTo,
        seekToWithoutScroll,
        scrollToUtterance,
        playerRef,
        seekToAndPlay,
        isSeeking,
        onTimeUpdate: handleTimeUpdate,
        onSeeked: handleSeeked,
        onSeeking: handleSeeking,
        setIsPlaying: async (shouldPlay: boolean) => {
            if (shouldPlay) {
                await playVideo();
            } else {
                await pauseVideo();
            }
        },
        meeting,
    };

    return (
        <VideoActionsContext.Provider value={actionsValue}>
            <VideoContext.Provider value={value}>
                {children}
            </VideoContext.Provider>
        </VideoActionsContext.Provider>
    );
};