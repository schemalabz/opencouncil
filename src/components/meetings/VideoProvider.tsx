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
        updateDuration();

        return () => {
            video?.removeEventListener('loadedmetadata', updateDuration);
        };
    }, []);

    const togglePlayPause = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
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

    return (
        <VideoContext.Provider value={value}>
            <video
                ref={videoRef}
                src={meeting.video}
                onTimeUpdate={handleTimeUpdate}
                style={{ display: 'none' }}
            />
            {children}
        </VideoContext.Provider>
    );
};