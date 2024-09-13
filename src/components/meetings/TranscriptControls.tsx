import { Play, Pause, Loader, Maximize2 } from "lucide-react"
import { useVideo } from "./VideoProvider"
import { cn } from "@/lib/utils";
import { SpeakerTag } from "@prisma/client";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { useTranscriptOptions } from "./options/OptionsContext";
import { Transcript as TranscriptType } from "@/lib/db/transcript"
import { useState } from "react";
import { Video } from "./Video";

export default function TranscriptControls({ isWide, className, speakerSegments }: { isWide: boolean, className?: string, speakerSegments: TranscriptType }) {
    const { isPlaying, togglePlayPause, currentTime, duration, seekTo, isSeeking, currentScrollInterval } = useVideo();
    const { options } = useTranscriptOptions();
    const [isSliderHovered, setIsSliderHovered] = useState(false);

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickPosition = isWide ? e.clientX - rect.left : e.clientY - rect.top;
        const totalLength = isWide ? rect.width : rect.height;
        const percentage = clickPosition / totalLength;
        seekTo(percentage * duration);
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

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const position = isWide ? e.clientX - rect.left : e.clientY - rect.top;
        const totalLength = isWide ? rect.width : rect.height;
        const percentage = position / totalLength;
        setHoverTime(percentage * duration);
    };

    const handleMouseLeave = () => {
        setHoverTime(null);
    };

    return (
        <>
            <div
                onMouseEnter={() => setIsSliderHovered(true)}
                onMouseLeave={() => {
                    setIsSliderHovered(false);
                    handleMouseLeave();
                }}
                className={cn(`cursor-pointer fixed ${isWide ? 'bottom-2 left-2 right-2 h-16' : 'top-2 left-2 bottom-2 w-16'} flex ${isWide ? 'flex-row' : 'flex-col'} items-center `, className)}>

                <button
                    onClick={togglePlayPause}
                    className="p-4 bg-white opacity-90 m-2 border h-16 w-16 flex items-center justify-center hover:bg-gray-100"
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ?
                        (isSeeking ? <Loader className="w-6 h-6 animate-spin" /> : <Pause className="w-6 h-6" />) : <Play className="w-6 h-6" />}
                </button>

                <Video className='object-contain w-16 h-16 bg-white opacity-90 m-2 border flex items-center justify-center group' expandable={true} onExpandChange={setIsExpanded} />

                {/* seek slider */}
                <div
                    className={`flex-grow cursor-pointer ${isWide ? 'h-16' : 'w-16'} bg-white opacity-95 m-2 border relative`}
                    onClick={handleSeek}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                >
                    {currentScrollInterval[0] !== currentScrollInterval[1] && (
                        <div
                            className={`absolute bg-yellow-200 opacity-40 ${isWide ? 'h-full' : 'w-full'} opacity-80`}
                            style={{
                                [isWide ? 'left' : 'top']: `${(currentScrollInterval[0] / duration) * 100}%`,
                                [isWide ? 'width' : 'height']: `${((currentScrollInterval[1] - currentScrollInterval[0]) / duration) * 100}%`,
                            }}
                        />
                    )}
                    {speakerSegments.map((segment, index) => {
                        const speakerTag = getSpeakerTag(segment.speakerTagId);
                        const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
                        const party = person?.partyId ? getParty(person.partyId) : undefined;
                        let speakerColor = party?.colorHex || '#D3D3D3';
                        let speakerName = person ? person.name_short : speakerTag?.label;

                        const isSelected = options.selectedSpeakerTag === speakerTag?.id;

                        return (
                            <div key={index}>
                                <div
                                    className={`absolute ${isWide ? 'h-1/2' : 'w-1/2'} opacity-100  ${isSelected ? 'animate-bounce' : ''}`}
                                    style={{
                                        backgroundColor: speakerColor,
                                        [isWide ? 'left' : 'top']: `${(segment.startTimestamp / duration) * 100}%`,
                                        [isWide ? 'width' : 'height']: `${((segment.endTimestamp - segment.startTimestamp) / duration) * 100}%`,
                                        [isWide ? 'top' : 'left']: isSelected ? '30%' : '30%',
                                        [isWide ? 'height' : 'width']: isSelected ? '40%' : '40%',
                                    }}

                                >
                                    {hoverTime && hoverTime >= segment.startTimestamp && hoverTime <= segment.endTimestamp && (
                                        <div
                                            className={`absolute ${isWide ? 'z-50 top-full left-1/2 transform -translate-x-1/2' : 'bottom-full left-1/2 transform -translate-x-1/2'} whitespace-nowrap text-white px-2 py-1 rounded text-xs`}
                                            style={{
                                                backgroundColor: speakerColor,
                                                [isWide ? 'left' : 'bottom']: `${(segment.startTimestamp / duration) * 100}%`,
                                            }}
                                        >
                                            {speakerName}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                    <div
                        className={`absolute bg-slate-600 ${isWide ? 'w-1 h-full' : 'h-1 w-full'} opacity-90`}
                        style={{
                            [isWide ? 'left' : 'top']: `${(currentTime / duration) * 100}%`,
                        }}
                    >
                        {isSliderHovered && (
                            <div className={`absolute ${isWide ? 'bottom-full left-1/2 transform -translate-x-1/2' : 'left-full top-1/2 transform -translate-y-1/2'} whitespace-nowrap bg-slate-600 text-white px-2 py-1 rounded text-xs`}>
                                {formatTimestamp(currentTime)}
                            </div>
                        )}
                    </div>
                    {hoverTime !== null && (
                        <div
                            className={`absolute bg-gray-600 ${isWide ? 'w-px h-11' : 'h-px w-11'} opacity-100 z-40`}
                            style={{
                                [isWide ? 'left' : 'top']: `${(hoverTime / duration) * 100}%`,
                            }}
                        >
                            <div className={`absolute ${isWide ? 'bottom-full left-1/2 transform -translate-x-1/2' : 'left-full top-1/2 transform -translate-y-1/2'} whitespace-nowrap bg-gray-400 text-white px-2 py-1 rounded text-xs z-30`}>
                                {formatTimestamp(hoverTime)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </>
    )
}
