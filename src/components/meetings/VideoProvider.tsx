import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { CouncilMeeting, SpeakerDiarization } from "@prisma/client";

interface VideoContextType {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
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
    meeting: CouncilMeeting & { speakerDiarizations: SpeakerDiarization[] };
}

export const VideoProvider: React.FC<VideoProviderProps> = ({ children, meeting }) => {
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

                        // Add a timeout to catch hanging promises
                        setTimeout(() => {
                            if (!videoRef.current?.paused) {
                                console.log('Play promise resolved (timeout)');
                                setIsPlaying(true);
                            } else {
                                console.error('Play promise did not resolve within timeout');
                                setIsPlaying(false);
                            }
                        }, 5000); // 5 second timeout
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

    const seekTo = (time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    };

    const value = {
        isPlaying,
        currentTime,
        duration,
        playbackSpeed,
        togglePlayPause,
        handleSpeedChange,
        seekTo,
        videoRef,
    };

    console.log(`Video url is ${meeting.video}`);
    return (
        <VideoContext.Provider value={value}>
            {children}
        </VideoContext.Provider>
    );
};