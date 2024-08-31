import { CouncilMeeting, SpeakerDiarization } from "@prisma/client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useVideo } from "./VideoProvider";
import PlaybackControls from "./PlaybackControls";
import Timeline from "./Timeline";
import ZoomControls from "./ZoomControls";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

const speakerColors = [
    'bg-red-200', 'bg-blue-200', 'bg-green-200', 'bg-yellow-200', 'bg-purple-200',
    'bg-pink-200', 'bg-indigo-200', 'bg-teal-200', 'bg-orange-200', 'bg-cyan-200'
];

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

export default function Controls({ meeting }: { meeting: CouncilMeeting & { speakerDiarizations: SpeakerDiarization[] } }) {
    const { currentTime, duration, videoRef } = useVideo();
    const [zoomLevel, setZoomLevel] = useState(1);
    const [visibleStartTime, setVisibleStartTime] = useState(0);
    const [speakerColorMap, setSpeakerColorMap] = useState<Record<string, string>>({});
    const [isVideoHovered, setIsVideoHovered] = useState(false);
    const [isVideoExpanded, setIsVideoExpanded] = useState(false);

    useEffect(() => {
        const uniqueSpeakers = Array.from(new Set(meeting.speakerDiarizations.map(d => d.label)));
        const colorMap: Record<string, string> = {};
        uniqueSpeakers.forEach((speaker, index) => {
            colorMap[speaker!] = speakerColors[index % speakerColors.length];
        });
        setSpeakerColorMap(colorMap);
    }, [meeting.speakerDiarizations]);

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

    const joinedDiarizations = joinAdjacentDiarizations([...meeting.speakerDiarizations]);

    const toggleVideoExpansion = () => {
        setIsVideoExpanded(!isVideoExpanded);
    };

    return (
        <div className={`fixed bottom-0 left-0 right-0 bg-background p-4 shadow-xl z-10 ${isVideoExpanded ? 'h-[80vh]' : ''} rounded-t-lg border-t border-gray-200 dark:border-gray-700`}>
            <div className={`flex flex-col h-full`}>
                {isVideoExpanded ? (
                    <div className={`relative h-[70%] bg-black flex items-center justify-center mb-2`}
                        onMouseEnter={() => setIsVideoHovered(true)}
                        onMouseLeave={() => setIsVideoHovered(false)}>
                        <video
                            ref={videoRef}
                            className="h-full w-auto"
                            playsInline
                            src={meeting.video}
                        />
                        {isVideoHovered && (
                            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center cursor-pointer"
                                onClick={toggleVideoExpansion}>
                                <ArrowDownLeft className="text-white h-8 w-8" />
                            </div>
                        )}
                    </div>
                ) : null}
                <div className={`flex ${isVideoExpanded ? 'h-[30%]' : 'h-full'} items-center space-x-4`}>
                    <div className="flex flex-col items-center space-y-2">
                        {!isVideoExpanded && (
                            <div className={`relative w-32 h-24 bg-black flex items-center justify-center mb-2`}
                                onMouseEnter={() => setIsVideoHovered(true)}
                                onMouseLeave={() => setIsVideoHovered(false)}>
                                <video
                                    ref={videoRef}
                                    className="h-full w-auto"
                                    playsInline
                                    src={meeting.video}
                                />
                                {isVideoHovered && (
                                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center cursor-pointer"
                                        onClick={toggleVideoExpansion}>
                                        <ArrowUpRight className="text-white h-6 w-6" />
                                    </div>
                                )}
                            </div>
                        )}
                        <PlaybackControls meeting={meeting} />
                    </div>
                    <div className="flex-grow">
                        <Timeline
                            joinedDiarizations={joinedDiarizations}
                            speakerColorMap={speakerColorMap}
                            zoomLevel={zoomLevel}
                            visibleStartTime={visibleStartTime}
                            setVisibleStartTime={setVisibleStartTime}
                            onScroll={handleScroll}
                        />
                    </div>
                    <ZoomControls onZoomIn={() => handleZoom('in')} onZoomOut={() => handleZoom('out')} />
                </div>
            </div>
        </div>
    );
}