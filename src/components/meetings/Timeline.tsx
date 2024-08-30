import React, { useRef, useState, useEffect, useCallback } from "react";
import { useVideo } from "./VideoProvider";
import { SpeakerDiarization } from "@prisma/client";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const getOverlappingDiarizations = (diarizations: SpeakerDiarization[]): SpeakerDiarization[][] => {
    const rows: SpeakerDiarization[][] = [];
    diarizations.forEach(diarization => {
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

interface TimelineProps {
    joinedDiarizations: SpeakerDiarization[];
    speakerColorMap: Record<string, string>;
    zoomLevel: number;
    visibleStartTime: number;
    setVisibleStartTime: React.Dispatch<React.SetStateAction<number>>;
    onScroll: (delta: number) => void;
}

export default function Timeline({
    joinedDiarizations,
    speakerColorMap,
    zoomLevel,
    visibleStartTime,
    setVisibleStartTime,
    onScroll
}: TimelineProps) {
    const { currentTime, duration, seekTo } = useVideo();
    const seekerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartTime, setDragStartTime] = useState(0);

    const renderTimeMarks = () => {
        const visibleDuration = duration / zoomLevel;
        const marks: React.ReactNode[] = [];
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
                        className="absolute bottom-0 text-xs text-gray-500 mb-1"
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
        e.preventDefault();
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
    }, [isDragging, dragStartX, dragStartTime, duration, zoomLevel, setVisibleStartTime]);

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

    const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (seekerRef.current && !isDragging) {
            const rect = seekerRef.current.getBoundingClientRect();
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const x = clientX - rect.left;
            const seekPercentage = x / rect.width;
            const visibleDuration = duration / zoomLevel;
            const newTime = visibleStartTime + seekPercentage * visibleDuration;
            seekTo(newTime);
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const overlappingDiarizations = getOverlappingDiarizations(joinedDiarizations);

    return (
        <div className="flex-grow">
            <div
                ref={seekerRef}
                className="relative cursor-pointer overflow-x-hidden"
                style={{ height: `${Math.max(100, overlappingDiarizations.length * 20 + 40)}px` }}
                onClick={handleSeek}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                onWheel={(e) => onScroll(e.deltaY)}
            >
                {renderTimeMarks()}
                {overlappingDiarizations.map((row, rowIndex) => (
                    <React.Fragment key={rowIndex}>
                        {row.map((diarization, index) => {
                            const visibleDuration = duration / zoomLevel;
                            const startPercentage = ((diarization.startTimestamp - visibleStartTime) / visibleDuration) * 100;
                            const widthPercentage = ((diarization.endTimestamp - diarization.startTimestamp) / visibleDuration) * 100;
                            if (startPercentage > 100 || startPercentage + widthPercentage < 0) return null;
                            const adjustedStartPercentage = Math.max(0, startPercentage);
                            const adjustedWidthPercentage = Math.min(100 - adjustedStartPercentage, widthPercentage);
                            return (
                                <Popover key={`${rowIndex}-${index}`}>
                                    <PopoverTrigger asChild>
                                        <div
                                            className={`absolute h-5 ${speakerColorMap[diarization.label!]} flex items-center justify-center text-xs overflow-hidden cursor-pointer opacity-80`}
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
    );
}