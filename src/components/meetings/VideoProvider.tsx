"use client"
import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { CouncilMeeting, Utterance, Word } from "@prisma/client";

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
    videoRef: React.RefObject<HTMLVideoElement>;
    isSeeking: boolean;
    setIsPlaying: (isPlaying: boolean) => void;
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
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        const updateDuration = () => {
            console.log(`Metadata loaded! Duration: ${video?.duration}`);
            if (video && !isNaN(video.duration)) {
                setDuration(video.duration);
            }
        };

        video?.addEventListener('loadedmetadata', updateDuration);
        video?.addEventListener('timeupdate', handleTimeUpdate);
        video?.addEventListener('seeking', () => setIsSeeking(true));
        video?.addEventListener('seeked', () => setIsSeeking(false));
        updateDuration();

        return () => {
            video?.removeEventListener('loadedmetadata', updateDuration);
            video?.removeEventListener('timeupdate', handleTimeUpdate);
            video?.removeEventListener('seeking', () => setIsSeeking(true));
            video?.removeEventListener('seeked', () => setIsSeeking(false));
        };
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const timeParam = urlParams.get('t');

        if (timeParam) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds) && videoRef.current) {
                videoRef.current.currentTime = seconds;
                setCurrentTime(seconds);
                setTimeout(() => scrollToUtterance(seconds), 1000);
            }
        }
    }, []);

    const playVideo = async () => {
        console.log("PLAYING");
        if (videoRef.current) {
            if (!hasStartedPlaying && utterances.length > 0) {
                if (currentTime === 0) {
                    videoRef.current.currentTime = utterances[0].startTimestamp;
                }
                setHasStartedPlaying(true);
            }
            await videoRef.current.play();
            setIsPlaying(true);
        }
    };

    const pauseVideo = async () => {
        if (videoRef.current) {
            await videoRef.current.pause();
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
        if (videoRef.current) {
            videoRef.current.playbackRate = parseFloat(value);
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

    // Update seekTo to include scrolling
    const seekTo = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                scrollToUtterance(time);
            });
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const newTime = videoRef.current.currentTime;
            setCurrentTime(prevTime => {
                if (Math.abs(prevTime - newTime) > 0.5) {
                    return newTime;
                }
                return prevTime;
            });
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
        videoRef,
        isSeeking,
        setIsPlaying: async (shouldPlay: boolean) => {
            if (shouldPlay) {
                await playVideo();
            } else {
                await pauseVideo();
            }
        },
    };

    return (
        <VideoContext.Provider value={value}>
            <audio
                ref={videoRef}
                src={meeting.audioUrl!}
                style={{ display: 'none' }}
                preload="metadata"
            />
            {children}
        </VideoContext.Provider>
    );
};