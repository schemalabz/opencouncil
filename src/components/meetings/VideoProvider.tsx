"use client"
import React, { createContext, useContext, useState, useRef, useEffect, SyntheticEvent, useCallback } from 'react';
import { CouncilMeeting, Utterance, Word } from "@prisma/client";
import { Video } from './Video';

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
    utterances: (Utterance & { words: Word[] })[];
}
export const VideoProvider: React.FC<VideoProviderProps> = ({ children, meeting, utterances }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const currentTimeRef = useRef(0);
    const [duration, setDuration] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState("1");
    const [isSeeking, setIsSeeking] = useState(false);
    const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
    const playerRef = useRef<HTMLVideoElement | null>(null);
    const [currentTime, setCurrentTime] = useState(0);

    useEffect(() => {
        const player = playerRef.current;
        const updateDuration = () => {
            if (player && !isNaN(player.duration)) {
                setDuration(player.duration);
            }
        };

        player?.addEventListener('loadedmetadata', updateDuration);
        updateDuration();

        return () => {
            player?.removeEventListener('loadedmetadata', updateDuration);
        };
    }, [playerRef.current, utterances]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const timeParam = urlParams.get('t');

        if (currentTimeRef.current === 0 && utterances.length > 0) {
            currentTimeRef.current = utterances[0].startTimestamp;
        }

        if (timeParam) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds) && playerRef.current) {
                playerRef.current.currentTime = seconds;
                currentTimeRef.current = seconds;
                setTimeout(() => scrollToUtterance(seconds), 1000);
            }
        }
    }, []);

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

    const pauseVideo = async () => {
        if (playerRef.current) {
            await playerRef.current.pause();
            setIsPlaying(false);
        }
    };

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

    // Scroll to the last utterance before the seek time or the first utterance if none before
    const scrollToUtterance = (time: number) => {
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
    };

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = Math.floor(timestamp % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    // Update seekTo to include scrolling
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

    const handleTimeUpdate = useCallback(() => {
        if (playerRef.current && !isSeeking) {
            if (isPlaying) {
                const newTime = playerRef.current.currentTime;
                currentTimeRef.current = newTime;
                setCurrentTime(newTime);
            }
        }
    }, [isSeeking, isPlaying]);

    const [currentScrollInterval, setCurrentScrollInterval] = useState<[number, number]>([0, 0]);

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
        scrollToUtterance,
        playerRef,
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