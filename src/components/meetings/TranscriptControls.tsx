import { Play, Pause, Loader } from "lucide-react"
import { useVideo } from "./VideoProvider"
import { cn } from "@/lib/utils";
import { SpeakerTag } from "@prisma/client";
import { useCouncilMeetingData } from "./CouncilMeetingDataContext";
import { useTranscriptOptions } from "./options/OptionsContext";
import { Transcript as TranscriptType } from "@/lib/db/transcript"

export default function TranscriptControls({ isWide, className, speakerSegments }: { isWide: boolean, className?: string, speakerSegments: TranscriptType }) {
    const { isPlaying, togglePlayPause, currentTime, duration, seekTo, isSeeking, currentScrollInterval } = useVideo();
    const { options } = useTranscriptOptions();

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickPosition = isWide ? e.clientX - rect.left : e.clientY - rect.top;
        const totalLength = isWide ? rect.width : rect.height;
        const percentage = clickPosition / totalLength;
        seekTo(percentage * duration);
    };

    const { getParty, getPerson, getSpeakerTag } = useCouncilMeetingData();
    return (
        <>
            <div className={cn(`fixed ${isWide ? 'bottom-2 left-2 right-2 h-16' : 'top-2 left-2 bottom-2 w-16'} flex ${isWide ? 'flex-row' : 'flex-col'} items-center `, className)}>
                <button
                    onClick={togglePlayPause}
                    className="p-4 bg-white opacity-90 m-2 border h-16 w-16 flex items-center justify-center hover:bg-gray-100"
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isPlaying ?
                        (isSeeking ? <Loader className="w-6 h-6 animate-spin" /> : <Pause className="w-6 h-6" />) : <Play className="w-6 h-6" />}
                </button>

                {/* seek slider */}
                <div
                    className={`flex-grow cursor-pointer ${isWide ? 'h-16' : 'w-16'} bg-white opacity-90 m-2 border relative`}
                    onClick={handleSeek}
                >
                    {currentScrollInterval[0] !== currentScrollInterval[1] && (
                        <div
                            className={`absolute bg-yellow-300 opacity-40 ${isWide ? 'h-full' : 'w-full'} opacity-80`}
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

                        const isSelected = options.selectedSpeakerTag === speakerTag?.id;
                        if (isSelected) {
                            speakerColor = '#81b3ff';
                        }

                        return (
                            <div
                                key={index}
                                className={`absolute ${isWide ? 'h-1/2' : 'w-1/2'} opacity-90`}
                                style={{
                                    backgroundColor: speakerColor,
                                    [isWide ? 'left' : 'top']: `${(segment.startTimestamp / duration) * 100}%`,
                                    [isWide ? 'width' : 'height']: `${((segment.endTimestamp - segment.startTimestamp) / duration) * 100}%`,
                                    [isWide ? 'top' : 'left']: isSelected ? '10%' : '25%',
                                    [isWide ? 'height' : 'width']: isSelected ? '80%' : '50%',
                                }}
                            />
                        )
                    })}
                    <div
                        className={`absolute bg-slate-600 ${isWide ? 'w-1 h-full' : 'h-1 w-full'} opacity-80`}
                        style={{
                            [isWide ? 'left' : 'top']: `${(currentTime / duration) * 100}%`,
                        }}
                    />
                </div>
            </div>

        </>
    )
}
