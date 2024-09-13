"use client"
import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
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
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState("1");
    const [isSeeking, setIsSeeking] = useState(false);
    const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
    const playerRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const player = playerRef.current;
        const updateDuration = () => {
            if (player && !isNaN(player.duration)) {
                setDuration(player.duration);
            }
        };

        player?.addEventListener('loadedmetadata', updateDuration);
        player?.addEventListener('timeupdate', handleTimeUpdate);
        player?.addEventListener('seeking', () => setIsSeeking(true));
        player?.addEventListener('seeked', () => {
            setIsSeeking(false);
            setCurrentTime(player.currentTime);
        });
        updateDuration();

        return () => {
            player?.removeEventListener('loadedmetadata', updateDuration);
            player?.removeEventListener('timeupdate', handleTimeUpdate);
            player?.removeEventListener('seeking', () => setIsSeeking(true));
            player?.removeEventListener('seeked', () => setIsSeeking(false));
        };
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const timeParam = urlParams.get('t');

        if (timeParam) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds) && playerRef.current) {
                playerRef.current.currentTime = seconds;
                setCurrentTime(seconds);
                setTimeout(() => scrollToUtterance(seconds), 1000);
            }
        }
    }, []);

    const playVideo = async () => {
        console.log("PLAYING");
        if (playerRef.current) {
            if (!hasStartedPlaying && utterances.length > 0) {
                if (currentTime === 0) {
                    // TODO: 
                    //playerRef.current.currentTime = utterances[0].startTimestamp;
                }
                setHasStartedPlaying(true);
            }
            await playerRef.current.play();
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
            console.log(`SEEK: Seeking to ${formatTimestamp(time)}`)
            playerRef.current.currentTime = time;
            setCurrentTime(time);
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                scrollToUtterance(time);
            });
        } else {
            console.log(`SEEK: No player element found`)
        }
    };

    const handleTimeUpdate = () => {
        if (playerRef.current && !isSeeking) {
            const newTime = playerRef.current.currentTime;
            setCurrentTime(newTime);
        }
    };

    const [currentScrollInterval, setCurrentScrollInterval] = useState<[number, number]>([0, 0]);

    const value = {
        isPlaying,
        currentTime,
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