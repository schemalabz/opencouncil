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
        updateDuration();

        return () => {
            video?.removeEventListener('loadedmetadata', updateDuration);
            video?.removeEventListener('timeupdate', handleTimeUpdate);
        };
    }, []);

    const togglePlayPause = async () => {
        console.log('togglePlayPause', isPlaying);
        console.log(`video url is ${meeting.videoUrl}`);
        if (videoRef.current) {
            try {
                if (isPlaying) {
                    await videoRef.current.pause();
                    setIsPlaying(false);
                } else {
                    console.log('Attempting to play');
                    const playPromise = videoRef.current.play();
                    if (playPromise !== undefined) {
                        console.log('Play promise created');
                        playPromise
                            .then(() => {
                                console.log('Video playback started successfully');
                                setIsPlaying(true);
                            })
                            .catch(error => {
                                console.error('Error playing video:', error);
                                setIsPlaying(false);
                            });
                    } else {
                        console.log('Play promise is undefined, video might be playing');
                        setIsPlaying(true);
                    }
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
            setCurrentTime(time);
            scrollToUtterance(time);
        }
    };



    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
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