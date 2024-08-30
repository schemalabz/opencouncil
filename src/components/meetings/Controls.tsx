import { CouncilMeeting, SpeakerDiarization } from "@prisma/client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Play, Pause, ZoomIn, ZoomOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const speakerColors = [
    'bg-red-200', 'bg-blue-200', 'bg-green-200', 'bg-yellow-200', 'bg-purple-200',
    'bg-pink-200', 'bg-indigo-200', 'bg-teal-200', 'bg-orange-200', 'bg-cyan-200'
];

export default function Controls({ meeting }: { meeting: CouncilMeeting & { speakerDiarizations: SpeakerDiarization[] } }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState("1");
    const [zoomLevel, setZoomLevel] = useState(1);
    const [visibleStartTime, setVisibleStartTime] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    const seekerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartTime, setDragStartTime] = useState(0);
    const [speakerColorMap, setSpeakerColorMap] = useState<Record<string, string>>({});

    useEffect(() => {
        const video = videoRef.current;
        const updateDuration = () => {
            if (video && !isNaN(video.duration)) {
                setDuration(video.duration);
            }
        };

        video?.addEventListener('loadedmetadata', updateDuration);

        // Initial check in case the metadata is already loaded
        updateDuration();

        return () => {
            video?.removeEventListener('loadedmetadata', updateDuration);
        };
    }, []);

    useEffect(() => {
        const uniqueSpeakers = Array.from(new Set(meeting.speakerDiarizations.map(d => d.label)));
        const colorMap: Record<string, string> = {};
        uniqueSpeakers.forEach((speaker, index) => {
            colorMap[speaker!] = speakerColors[index % speakerColors.length];
        });
        setSpeakerColorMap(colorMap);
    }, [meeting.speakerDiarizations]);

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

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const newTime = videoRef.current.currentTime;
            setCurrentTime(newTime);

            // Pan the timeline if the current time is out of view
            const visibleDuration = duration / zoomLevel;
            if (newTime < visibleStartTime || newTime > visibleStartTime + visibleDuration) {
                setVisibleStartTime(Math.max(0, Math.min(duration - visibleDuration, newTime - visibleDuration / 2)));
            }
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const handleSpeedChange = (value: string) => {
        setPlaybackSpeed(value);
        if (videoRef.current) {
            videoRef.current.playbackRate = parseFloat(value);
        }
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (seekerRef.current && videoRef.current && !isDragging) {
            const rect = seekerRef.current.getBoundingClientRect();
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const x = clientX - rect.left;
            const seekPercentage = x / rect.width;
            const visibleDuration = duration / zoomLevel;
            const newTime = visibleStartTime + seekPercentage * visibleDuration;
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };

    const handleZoom = (direction: 'in' | 'out') => {
        setZoomLevel(prevZoom => {
            const newZoom = direction === 'in' ? prevZoom * 1.2 : prevZoom / 1.2;
            const clampedZoom = Math.max(1, Math.min(newZoom, 10)); // Limit zoom between 1x and 10x

            // Adjust visibleStartTime to keep current time in view
            const visibleDuration = duration / clampedZoom;
            const newVisibleStartTime = Math.max(0, Math.min(duration - visibleDuration, currentTime - visibleDuration / 2));
            setVisibleStartTime(newVisibleStartTime);

            return clampedZoom;
        });
    };

    const handleScroll = useCallback((delta: number) => {
        setZoomLevel(prevZoom => {
            const newZoom = delta > 0 ? prevZoom / 1.1 : prevZoom * 1.1;
            const clampedZoom = Math.max(1, Math.min(newZoom, 10)); // Limit zoom between 1x and 10x

            // Adjust visibleStartTime to keep current time in view
            const visibleDuration = duration / clampedZoom;
            const newVisibleStartTime = Math.max(0, Math.min(duration - visibleDuration, currentTime - visibleDuration / 2));
            setVisibleStartTime(newVisibleStartTime);

            return clampedZoom;
        });
    }, [currentTime, duration]);
    const joinAdjacentDiarizations = (diarizations: SpeakerDiarization[]): SpeakerDiarization[] => {
        return diarizations.reduce((acc: SpeakerDiarization[], curr: SpeakerDiarization) => {
            if (acc.length === 0) {
                return [curr];
            }
            const lastSameSpeaker = acc.findLast(d => d.label === curr.label);
            if (lastSameSpeaker && (curr.startTimestamp - lastSameSpeaker.endTimestamp) < 10) {
                lastSameSpeaker.endTimestamp = curr.endTimestamp;
                return acc;
            }
            return [...acc, curr];
        }, []);
    };

    const joinedDiarizations = joinAdjacentDiarizations([...meeting.speakerDiarizations]);

    const getOverlappingDiarizations = () => {
        const rows: SpeakerDiarization[][] = [];
        joinedDiarizations.forEach(diarization => {
            let placed = false;
            for (const row of rows) {
                if (!row.some(d =>
                    (diarization.startTimestamp < d.endTimestamp && diarization.endTimestamp > d.startTimestamp)
                )) {
                    row.push(diarization);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                rows.push([diarization]);
            }
        });
        return rows;
    };

    const overlappingDiarizations = getOverlappingDiarizations();

    const renderTimeMarks = () => {
        const visibleDuration = duration / zoomLevel;
        const marks = [];
        for (let i = 0; i <= visibleDuration; i += 10) {
            const left = (i / visibleDuration) * 100;
            const isMinute = i % 60 === 0;
            marks.push(
                <div
                    key={i}
                    className={`absolute top-0 bottom-0 w-px ${isMinute ? 'bg-gray-400' : 'bg-gray-200'}`}
                    style={{ left: `${left}%` }}
                />
            );
            if (isMinute) {
                marks.push(
                    <div
                        key={`label-${i}`}
                        className="absolute top-full text-xs text-gray-500 mt-1"
                        style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
                    >
                        {formatTime(visibleStartTime + i)}
                    </div>
                );
            }
        }
        return marks;
    };

    const handleDragStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        setIsDragging(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        setDragStartX(clientX);
        setDragStartTime(visibleStartTime);
        e.preventDefault(); // Prevent default to avoid text selection
    };

    const handleDragMove = useCallback((clientX: number) => {
        if (isDragging && seekerRef.current) {
            const rect = seekerRef.current.getBoundingClientRect();
            const deltaX = dragStartX - clientX;
            const visibleDuration = duration / zoomLevel;
            const timeDelta = (deltaX / rect.width) * visibleDuration;
            const newVisibleStartTime = Math.max(0, Math.min(duration - visibleDuration, dragStartTime + timeDelta));
            setVisibleStartTime(newVisibleStartTime);
        }
    }, [isDragging, dragStartX, dragStartTime, duration, zoomLevel]);

    const handleDragEnd = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
        const handleTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientX);

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('touchmove', handleTouchMove);
            document.addEventListener('mouseup', handleDragEnd);
            document.addEventListener('touchend', handleDragEnd);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('mouseup', handleDragEnd);
            document.removeEventListener('touchend', handleDragEnd);
        };
    }, [isDragging, handleDragMove]);
    return (
        <div className="fixed bottom-0 left-0 right-0 bg-background p-4 shadow-lg z-10">
            <video
                ref={videoRef}
                src={meeting.video}
                onTimeUpdate={handleTimeUpdate}
                style={{ display: 'none' }}
            />
            <div className="flex items-start space-x-4">
                <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                        <Button onClick={togglePlayPause} size="icon">
                            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Select value={playbackSpeed} onValueChange={handleSpeedChange}>
                            <SelectTrigger className="w-[80px]">
                                <SelectValue placeholder="Speed" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">1x</SelectItem>
                                <SelectItem value="1.2">1.2x</SelectItem>
                                <SelectItem value="1.5">1.5x</SelectItem>
                                <SelectItem value="2">2x</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="text-sm">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                </div>
                <div className="flex-grow">
                    <div
                        ref={seekerRef}
                        className="relative cursor-pointer overflow-x-hidden"
                        style={{ height: `${Math.max(100, overlappingDiarizations.length * 20 + 40)}px` }}
                        onClick={handleSeek}
                        onMouseDown={handleDragStart}
                        onTouchStart={handleDragStart}
                        onWheel={(e) => handleScroll(e.deltaY)}
                    >
                        {renderTimeMarks()}
                        {overlappingDiarizations.map((row, rowIndex) => (
                            <React.Fragment key={rowIndex}>
                                {row.map((diarization, index) => {
                                    const visibleDuration = duration / zoomLevel;
                                    const startPercentage = ((diarization.startTimestamp - visibleStartTime) / visibleDuration) * 100;
                                    const widthPercentage = ((diarization.endTimestamp - diarization.startTimestamp) / visibleDuration) * 100;
                                    if (startPercentage > 100 || startPercentage + widthPercentage < 0) return null;
                                    const adjustedStartPercentage = startPercentage;
                                    const adjustedWidthPercentage = Math.min(100 - adjustedStartPercentage, widthPercentage);
                                    return (
                                        <Popover key={`${rowIndex}-${index}`}>
                                            <PopoverTrigger asChild>
                                                <div
                                                    className={`absolute h-5 ${speakerColorMap[diarization.label!]} opacity-50 flex items-center justify-center text-xs overflow-hidden cursor-pointer`}
                                                    style={{
                                                        left: `${adjustedStartPercentage}%`,
                                                        width: `${adjustedWidthPercentage}%`,
                                                        top: `${rowIndex * 20 + 20}px`,
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {diarization.label}
                                                </div>
                                            </PopoverTrigger>
                                            <PopoverContent>
                                                {diarization.label}
                                            </PopoverContent>
                                        </Popover>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                        <div
                            className="absolute top-0 bottom-0 w-1 bg-blue-500"
                            style={{ left: `${((currentTime - visibleStartTime) / (duration / zoomLevel)) * 100}%` }}
                        />
                    </div>
                </div>
                <div className="flex flex-col space-y-2">
                    <Button onClick={() => handleZoom('in')} size="icon" variant="outline">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => handleZoom('out')} size="icon" variant="outline">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}