"use client"
import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { CouncilMeeting } from "@prisma/client";

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
    videoRef: React.RefObject<HTMLVideoElement>;
    isSeeking: boolean;
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
    utteranceTimes: {
        id: string;
        start: number;
        end: number;
    }[];
}

export const VideoProvider: React.FC<VideoProviderProps> = ({ children, meeting, utteranceTimes }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState("1");
    const [isSeeking, setIsSeeking] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        const updateDuration = () => {
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

    const togglePlayPause = async () => {
        if (videoRef.current) {
            try {
                if (videoRef.current.paused) {
                    await videoRef.current.play();
                    setIsPlaying(true);
                } else {
                    await videoRef.current.pause();
                    setIsPlaying(false);
                }
            } catch (error) {
                console.error('Error in togglePlayPause:', error);
                setIsPlaying(false);
            }
        } else {
            console.error('Video element not found');
        }
    };

    const handleSpeedChange = (value: string) => {
        setPlaybackSpeed(value);
        if (videoRef.current) {
            videoRef.current.playbackRate = parseFloat(value);
        }
    };

    // Scroll to the last utterance before the seek time
    const scrollToUtterance = (time: number) => {
        const lastUtteranceBeforeTime = utteranceTimes
            .filter(u => u.start <= time)
            .sort((a, b) => b.start - a.start)[0];

        if (lastUtteranceBeforeTime) {
            const utteranceElement = document.getElementById(lastUtteranceBeforeTime.id);
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
        videoRef,
        isSeeking,
    };

    return (
        <VideoContext.Provider value={value}>
            <video
                ref={videoRef}
                src={meeting.videoUrl!}
                style={{ display: 'none' }}
            />
            {children}
        </VideoContext.Provider>
    );
};