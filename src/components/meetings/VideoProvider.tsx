"use client"
import React, { createContext, useContext, useState, useRef, useEffect, SyntheticEvent, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { CouncilMeeting, Utterance } from "@prisma/client";
import { useTranscriptOptions } from './options/OptionsContext';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';

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

export const VideoProvider: React.FC<VideoProviderProps> = ({ children, meeting }) => {
    const { options } = useTranscriptOptions();
    const searchParams = useSearchParams();
    const { transcript } = useCouncilMeetingData();
    const utterances = useMemo<Utterance[]>(() => transcript.flatMap(s => s.utterances ?? []), [transcript]);

    // === CORE VIDEO STATE ===
    const [isPlaying, setIsPlaying] = useState(false); // React state for UI updates
    const currentTimeRef = useRef(0); // Ref for immediate access without re-renders
    const [duration, setDuration] = useState(0); // Total video duration
    const [playbackSpeed, setPlaybackSpeed] = useState(options.playbackSpeed.toString());
    const [isSeeking, setIsSeeking] = useState(false); // True when user is dragging timeline
    const [hasStartedPlaying, setHasStartedPlaying] = useState(false); // First play flag
    const playerRef = useRef<HTMLVideoElement | null>(null); // Direct reference to video element
    const [currentTime, setCurrentTime] = useState(0); // React state for UI (throttled updates)
    const hasSetInitialTime = useRef(false); // Ensures initial time is set only once
    const hasAppliedUrlParam = useRef(false); // Ensures ?t= deep link is applied only once

    // Scroll to the last utterance before the seek time or the first utterance if none before
    const scrollToUtterance = useCallback((time: number) => {
        const lastUtteranceBeforeTime = utterances
            .filter((u) => u.startTimestamp <= time)
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
    }, []);

    // === URL PARAMETER HANDLING ===
    const timeParam = searchParams.get('t');

    // === INITIAL TIME SETUP ===
    useEffect(() => {
        // Set initial time to first utterance only on first load
        if (!hasSetInitialTime.current && utterances.length > 0) {
            hasSetInitialTime.current = true;
            currentTimeRef.current = utterances[0].startTimestamp;
            setCurrentTime(utterances[0].startTimestamp);
        }
    }, [utterances.length]); // Re-run when utterance count changes; hasSetInitialTime guard prevents double-run

    // === URL PARAMETER DEEP-LINK ===
    // One-shot: flag is set only after a successful seek so that if playerRef.current is not yet
    // available (conditional render), the next effect run can retry.
    // Share URLs encode timestamps with Math.floor (see ShareDropdown, ContributionCard),
    // so we resolve the floor'd second back to the exact utterance startTimestamp.
    useEffect(() => {
        if (timeParam && !hasAppliedUrlParam.current) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds) && playerRef.current) {
                hasAppliedUrlParam.current = true;
                const targetUtterance = utterances.find(u => Math.floor(u.startTimestamp) === seconds);
                const targetTime = targetUtterance?.startTimestamp ?? seconds;

                currentTimeRef.current = targetTime;
                setCurrentTime(targetTime);
                
                // Retry scrolling until the utterance DOM element is rendered
                const scrollAttempt = (attemptsLeft: number) => {
                    setTimeout(() => {
                        const utteranceElement = utterances
                            .filter(u => u.startTimestamp <= targetTime)
                            .sort((a, b) => b.startTimestamp - a.startTimestamp)[0];

                        if (utteranceElement) {
                            const element = document.getElementById(utteranceElement.id);
                            if (element) {
                                updateHighlightOnce();
                                // content-visibility:auto causes layout shifts as off-screen
                                // segments render at their actual size. Re-scroll to correct.
                                for (const delay of [150, 500, 1000]) {
                                    setTimeout(() => {
                                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }, delay);
                                }
                            } else if (attemptsLeft > 0) {
                                scrollAttempt(attemptsLeft - 1);
                            }
                        }
                    }, 500);
                };

                scrollAttempt(3);
            }
        }
    }, [timeParam, utterances.length]);

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
            setCurrentTime(currentTimeRef.current);
        }
    }

    const handleSpeedChange = (value: string) => {
        setPlaybackSpeed(value);
        if (playerRef.current) {
            playerRef.current.playbackRate = parseFloat(value);
        }
    };

    /**
     * SEEK CORE:
     * - Sets video currentTime to specific timestamp
     * - Updates internal time reference and highlight
     */
    const applySeek = (time: number) => {
        if (!playerRef.current) return;
        if (hasStartedPlaying) {
            playerRef.current.currentTime = time;
        }
        currentTimeRef.current = time;
        setCurrentTime(time);
        updateHighlightOnce();
    };

    /**
     * SEEK TO TIME:
     * - Seeks to time and scrolls transcript to corresponding utterance
     */
    const seekTo = (time: number) => {
        if (playerRef.current && hasStartedPlaying) {
            playerRef.current.currentTime = time;
        }
        currentTimeRef.current = time;
        setCurrentTime(time);
        
        if (hasStartedPlaying) {
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                scrollToUtterance(time);
            });
        }
    };

    /**
     * SEEK WITHOUT SCROLL:
     * - Seeks to time without triggering transcript scroll
     * - Used for programmatic seeking
     */
    const seekToWithoutScroll = (time: number) => {
        applySeek(time);
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
    }, [isSeeking, isPlaying]);

    /**
     * THROTTLED TIME UPDATE:
     * - Reduces UI re-renders by limiting setCurrentTime calls
     */
    const throttledSetCurrentTime = useRef(
        throttle((time: number) => {
            setCurrentTime(time);
        }, 2000)
    ).current;

    const seekToAndPlay = (time: number) => {
        seekTo(time);
        playVideo();
    }

    const [currentScrollInterval, setCurrentScrollInterval] = useState<[number, number]>([0, 0]);

    // === DOM-BASED ACTIVE UTTERANCE HIGHLIGHTING ===
    const styleRef = useRef<HTMLStyleElement | null>(null);
    const activeUtteranceIdRef = useRef<string | null>(null);

    const utterancesBySecond = useMemo(() => {
        const map = new Map<number, Utterance[]>();
        for (const u of utterances) {
            for (let s = Math.floor(u.startTimestamp); s <= Math.floor(u.endTimestamp); s++) {
                const existing = map.get(s);
                if (existing) {
                    existing.push(u);
                } else {
                    map.set(s, [u]);
                }
            }
        }
        return map;
    }, [utterances]);

    const updateHighlightOnce = useCallback(() => {
        const time = currentTimeRef.current;
        const candidates = utterancesBySecond.get(Math.floor(time));
        const activeUtterance = candidates?.find(u => u.startTimestamp <= time && u.endTimestamp >= time) ?? null;
        const newActiveId = activeUtterance?.id ?? null;

        if (newActiveId !== activeUtteranceIdRef.current) {
            activeUtteranceIdRef.current = newActiveId;
            if (styleRef.current) {
                styleRef.current.textContent = newActiveId
                    ? `#${CSS.escape(newActiveId)} { background: hsl(var(--accent)); }`
                    : '';
            }
        }
    }, [utterancesBySecond]);

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
    }), []);

    const value = {
        isPlaying,
        currentTime,
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
