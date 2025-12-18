"use client"
import React, { createContext, useContext, useState, useRef, useEffect, SyntheticEvent, useCallback } from 'react';
import { CouncilMeeting, Utterance } from "@prisma/client";
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

export const useVideo = () => {
    const context = useContext(VideoContext);
    if (!context) {
        throw new Error('useVideo must be used within a VideoProvider');
    }
    return context;
};

interface VideoProviderProps {
    children: React.ReactNode;
    meeting: CouncilMeeting;
    utterances: Utterance[];
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
                utteranceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        }, 250) // Update at most every 250ms
    ).current;

    const seekToAndPlay = (time: number) => {
        seekTo(time);
        playVideo();
    }

    const [currentScrollInterval, setCurrentScrollInterval] = useState<[number, number]>([0, 0]);

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
        }
    };

    const value = {
        isPlaying,
        currentTime: currentTimeRef.current,
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
        <VideoContext.Provider value={value}>
            {children}
        </VideoContext.Provider>
    );
};