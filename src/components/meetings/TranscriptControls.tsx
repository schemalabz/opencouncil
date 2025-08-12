"use client"
import { Play, Pause, Loader, Maximize2, ChevronLeft, ChevronRight, SlidersHorizontal, Youtube } from "lucide-react"
import { useVideo } from "./VideoProvider"
import { cn } from "@/lib/utils";
import { SpeakerTag } from "@prisma/client";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { useTranscriptOptions } from "./options/OptionsContext";
import { useHighlight } from "./HighlightContext";
import { Transcript as TranscriptType } from "@/lib/db/transcript"
import { useState, useRef, useEffect } from "react";
import { Video } from "./Video";

export default function TranscriptControls({ className }: { className?: string }) {
    const { transcript: speakerSegments } = useCouncilMeetingData();
    const { isPlaying, togglePlayPause, currentTime, duration, seekTo, isSeeking, currentScrollInterval } = useVideo();
    const { options } = useTranscriptOptions();
    const { editingHighlight, highlightUtterances, previewMode, currentHighlightIndex } = useHighlight();
    const [isSliderHovered, setIsSliderHovered] = useState(false);
    const [isTouchActive, setIsTouchActive] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);
    const [isWide, setIsWide] = useState(false);
    const [isControlsVisible, setIsControlsVisible] = useState(false);
    const [hoveredSpeaker, setHoveredSpeaker] = useState<{ name: string, color: string } | null>(null);
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 }); // Track cursor position

    useEffect(() => {
        const checkSize = () => {
            const wide = window.innerWidth > window.innerHeight;
            setIsWide(wide);
            // If it's desktop (wide), make controls visible by default
            if (wide) {
                setIsControlsVisible(true);
            }
        }

        checkSize()
        window.addEventListener('resize', checkSize)

        return () => window.removeEventListener('resize', checkSize)
    }, [])


    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickPosition = isWide ? e.clientX - rect.left : e.clientY - rect.top;
        const totalLength = isWide ? rect.width : rect.height;
        const percentage = clickPosition / totalLength;
        seekTo(percentage * duration);
    };

    const handleTouchSeek = (touch: React.Touch) => {
        if (!sliderRef.current) return;
        const rect = sliderRef.current.getBoundingClientRect();
        const touchPosition = isWide ? touch.clientX - rect.left : touch.clientY - rect.top;
        const totalLength = isWide ? rect.width : rect.height;
        let percentage = touchPosition / totalLength;
        percentage = Math.max(0, Math.min(1, percentage));
        const touchTime = percentage * duration;
        setHoverTime(touchTime);

        // Set cursor position for tooltip placement
        setCursorPosition({
            x: touch.clientX,
            y: touch.clientY
        });

        // Find the speaker at this time
        updateHoveredSpeaker(touchTime);
    };

    const formatTimestamp = (timestamp: number) => {
        const hours = Math.floor(timestamp / 3600);
        const minutes = Math.floor((timestamp % 3600) / 60);
        const seconds = Math.floor(timestamp % 60);
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };
    const { getParty, getPerson, getSpeakerTag } = useCouncilMeetingData();
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const updateHoveredSpeaker = (time: number) => {
        for (const segment of speakerSegments) {
            if (time >= segment.startTimestamp && time <= segment.endTimestamp) {
                const speakerTag = getSpeakerTag(segment.speakerTagId);
                const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
                const party = person?.roles?.find(role => role.party)?.party;
                let speakerColor = party?.colorHex || '#D3D3D3';
                let speakerName = person ? person.name_short : speakerTag?.label || 'Unknown';

                setHoveredSpeaker({ name: speakerName, color: speakerColor });
                return;
            }
        }
        setHoveredSpeaker(null);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const position = isWide ? e.clientX - rect.left : e.clientY - rect.top;
        const totalLength = isWide ? rect.width : rect.height;
        const percentage = position / totalLength;
        const time = percentage * duration;
        setHoverTime(time);

        // Set cursor position for tooltip placement
        setCursorPosition({
            x: e.clientX,
            y: e.clientY
        });

        // Find the speaker at this time
        updateHoveredSpeaker(time);
    };

    const handleMouseLeave = () => {
        setHoverTime(null);
        setHoveredSpeaker(null);
    };

    const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        e.preventDefault(); // Prevent default touch behavior
        setIsTouchActive(true);
        if (e.touches.length > 0) {
            handleTouchSeek(e.touches[0]);
        }
    };

    const onTouchMoveHandler = (e: React.TouchEvent<HTMLDivElement>) => {
        e.preventDefault(); // Prevent default touch behavior
        if (e.touches.length > 0) {
            handleTouchSeek(e.touches[0]);
        }
    };

    const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
        e.preventDefault(); // Prevent default touch behavior
        if (hoverTime !== null) {
            seekTo(hoverTime);
        }
        setIsTouchActive(false);
        setHoverTime(null);
        setHoveredSpeaker(null);
    };

    // Find current speaker
    const currentSpeaker = (() => {
        for (const segment of speakerSegments) {
            if (currentTime >= segment.startTimestamp && currentTime <= segment.endTimestamp) {
                const speakerTag = getSpeakerTag(segment.speakerTagId);
                const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
                const party = person?.roles?.find(role => role.party)?.party;
                let speakerColor = party?.colorHex || '#D3D3D3';
                let speakerName = person ? person.name_short : speakerTag?.label || 'Unknown';

                return { name: speakerName, color: speakerColor };
            }
        }
        return null;
    })();

    // Calculate tooltip position
    const getTooltipPosition = () => {
        if (!sliderRef.current || hoverTime === null) return {};

        const rect = sliderRef.current.getBoundingClientRect();
        const percentage = hoverTime / duration;

        if (isWide) {
            // Horizontal mode - position above the slider
            const left = rect.left + percentage * rect.width;
            return {
                left: `${left}px`,
                top: `${rect.top - 50}px`,
                transform: 'translateX(-50%)'
            };
        } else {
            // Vertical mode - position to the left of the slider
            const top = rect.top + percentage * rect.height;
            return {
                left: `${rect.left - 110}px`,
                top: `${top}px`,
                transform: 'translateY(-50%)'
            };
        }
    };

    const tooltipStyle = getTooltipPosition();

    // Check if we're in highlight editing mode
    const isHighlightMode = editingHighlight !== null;

    return (
        <>
            {!isWide && (
                <button
                    onClick={() => setIsControlsVisible(prev => !prev)}
                    className={`fixed bottom-4 ${isControlsVisible ? 'right-[4.5rem]' : 'right-2'} 
                    z-50 bg-[hsl(var(--orange))] hover:bg-[hsl(var(--orange)/0.85)] text-white border-2 shadow-lg transition-all duration-200
                    p-2 rounded-lg flex items-center gap-1.5`}
                    aria-label={isControlsVisible ? "Hide controls" : "Show controls"}
                >
                    <Youtube className="w-4 h-4" />
                    {isControlsVisible ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                </button>
            )}
            <div
                onMouseEnter={() => setIsSliderHovered(true)}
                onMouseLeave={() => {
                    setIsSliderHovered(false);
                    handleMouseLeave();
                }}
                className={cn(
                    `cursor-pointer fixed ${isWide ? 'bottom-2 left-2 right-2 h-12' : 'top-2 right-2 bottom-2 w-12'} 
                    flex ${isWide ? 'flex-row' : 'flex-col'} items-center z-50 transition-transform duration-200`,
                    !isWide && !isControlsVisible && 'translate-x-[4.5rem]',
                    className
                )}>

                <button
                    onClick={togglePlayPause}
                    className="p-2 bg-white border-2 h-12 w-12 flex items-center justify-center hover:bg-gray-100 mx-1 my-1"
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ?
                        (isSeeking ? <Loader className="w-5 h-5 animate-spin" /> : <Pause className="w-5 h-5" />) : <Play className="w-5 h-5" />}
                </button>

                <Video className={`object-contain w-12 h-12 bg-white border-2 flex items-center justify-center group mx-1 my-1 ${isExpanded ? 'hidden' : ''}`} expandable={true} onExpandChange={setIsExpanded} />

                {/* Slider Container */}
                <div
                    ref={sliderRef}
                    className={`flex-grow cursor-pointer ${isWide ? 'h-12' : 'w-12'} bg-white border-2 mx-1 my-1 relative`}
                    onClick={handleSeek}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMoveHandler}
                    onTouchEnd={onTouchEnd}
                >
                    {currentScrollInterval[0] !== currentScrollInterval[1] && (
                        <div
                            className={`absolute bg-yellow-200 ${isWide ? 'h-full' : 'w-full'}`}
                            style={{
                                [isWide ? 'left' : 'top']: `${(currentScrollInterval[0] / duration) * 100}%`,
                                [isWide ? 'width' : 'height']: `${((currentScrollInterval[1] - currentScrollInterval[0]) / duration) * 100}%`,
                            }}
                        />
                    )}
                    
                    {/* Speaker Segments - Base Layer */}
                    {speakerSegments.map((segment, index) => {
                        const speakerTag = getSpeakerTag(segment.speakerTagId);
                        const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
                        const party = person?.roles?.find(role => role.party)?.party;
                        let speakerColor = party?.colorHex || '#D3D3D3';
                        let speakerName = person ? person.name_short : speakerTag?.label;

                        const isSelected = options.selectedSpeakerTag === speakerTag?.id;

                        return (
                            <div key={index}>
                                <div
                                    className={`absolute ${isWide ? 'h-3/4' : 'w-3/4'} ${isSelected ? 'animate-bounce' : ''}`}
                                    style={{
                                        backgroundColor: speakerColor,
                                        opacity: isHighlightMode ? 0.3 : 1, // Dim when in highlight mode
                                        [isWide ? 'left' : 'top']: `${(segment.startTimestamp / duration) * 100}%`,
                                        [isWide ? 'width' : 'height']: `${((segment.endTimestamp - segment.startTimestamp) / duration) * 100}%`,
                                        [isWide ? 'top' : 'left']: isSelected ? '10%' : '10%',
                                        [isWide ? 'height' : 'width']: isSelected ? '80%' : '80%',
                                    }}
                                />
                            </div>
                        )
                    })}

                    {/* Highlight Layer - Only show when editing a highlight */}
                    {isHighlightMode && highlightUtterances && highlightUtterances.map((utterance, index) => {
                        const isHighlighted = editingHighlight?.highlightedUtterances.some(hu => hu.utteranceId === utterance.id);
                        const isCurrentHighlight = index === currentHighlightIndex;
                        
                        if (!isHighlighted) return null;

                        return (
                            <div key={`highlight-${utterance.id}`}>
                                <div
                                    className={cn(
                                        `absolute ${isWide ? 'h-full' : 'w-full'} cursor-pointer hover:bg-amber-500 transition-colors`,
                                        previewMode && isCurrentHighlight ? 'bg-amber-600' : 'bg-amber-400'
                                    )}
                                    style={{
                                        [isWide ? 'left' : 'top']: `${(utterance.startTimestamp / duration) * 100}%`,
                                        [isWide ? 'width' : 'height']: `${((utterance.endTimestamp - utterance.startTimestamp) / duration) * 100}%`,
                                        zIndex: 10, // Above speaker segments
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        seekTo(utterance.startTimestamp);
                                    }}
                                    title={`${utterance.speakerName}: ${utterance.text.substring(0, 50)}...`}
                                />
                            </div>
                        );
                    })}

                    <div
                        className={`absolute bg-slate-600 ${isWide ? 'w-1 h-full' : 'h-1 w-full'}`}
                        style={{
                            [isWide ? 'left' : 'top']: `${(currentTime / duration) * 100}%`,
                        }}
                    />
                    {(hoverTime !== null) && (
                        <div
                            className={`absolute bg-gray-600 ${isWide ? 'w-px h-10' : 'h-px w-10'}`}
                            style={{
                                [isWide ? 'left' : 'top']: `${(hoverTime / duration) * 100}%`,
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Tooltip Panel - Positioned via fixed positioning */}
            {isSliderHovered && hoverTime !== null && (
                <div
                    className="fixed bg-white border-2 rounded p-1.5 text-xs z-50 shadow-md pointer-events-none"
                    style={tooltipStyle}
                >
                    <div className="font-bold">
                        {formatTimestamp(hoverTime)}
                    </div>
                    {hoveredSpeaker && (
                        <div
                            className="mt-1 px-2 py-1 rounded truncate"
                            style={{ backgroundColor: hoveredSpeaker.color }}
                        >
                            <span className="text-white text-[10px]">{hoveredSpeaker.name}</span>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}