"use client";
import { SpeakerSegment as SpeakerSegmentType } from "@prisma/client";
import SpeakerSegment from "./SpeakerSegment";
import { useEffect, useRef, useMemo } from 'react';
import { useVideo } from "../VideoProvider";
import { Utterance } from "@prisma/client";
import { Transcript as TranscriptType } from "@/lib/db/transcript";
import { useInView } from 'react-intersection-observer';
import { debounce } from '@/lib/utils';
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { BarChart2, FileIcon, ScrollText } from "lucide-react";

export default function Transcript() {
    const { transcript: speakerSegments } = useCouncilMeetingData();
    const { setCurrentScrollInterval, currentTime } = useVideo();
    const containerRef = useRef<HTMLDivElement>(null);

    // Add effect to handle initial scroll position
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const timeParam = urlParams.get('t');

        if (timeParam && containerRef.current) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds)) {
                // Force an immediate scroll update
                const updateScrollInterval = () => {
                    const visibleSegments = Array.from(containerRef.current!.children)
                        .filter((child) => {
                            const rect = child.getBoundingClientRect();
                            return rect.top < window.innerHeight && rect.bottom >= 0;
                        })
                        .map((child) => speakerSegments[parseInt(child.id.split('-')[2])]);

                    if (visibleSegments.length > 0) {
                        const firstVisible = visibleSegments[0];
                        const lastVisible = visibleSegments[visibleSegments.length - 1];
                        setCurrentScrollInterval([firstVisible.startTimestamp, lastVisible.endTimestamp]);
                    }
                };

                // Update scroll interval after a short delay to ensure components are rendered
                setTimeout(updateScrollInterval, 100);
            }
        }
    }, [speakerSegments, setCurrentScrollInterval]);

    const debouncedSetCurrentScrollInterval = useMemo(
        () => debounce(setCurrentScrollInterval, 500),
        [setCurrentScrollInterval]
    );

    useEffect(() => {
        if (!containerRef.current) return;

        const updateScrollInterval = () => {
            const visibleSegments = Array.from(containerRef.current!.children)
                .filter((child) => {
                    const rect = child.getBoundingClientRect();
                    return rect.top < window.innerHeight && rect.bottom >= 0;
                })
                .map((child) => speakerSegments[parseInt(child.id.split('-')[2])]);

            if (visibleSegments.length > 0) {
                const firstVisible = visibleSegments[0];
                const lastVisible = visibleSegments[visibleSegments.length - 1];
                debouncedSetCurrentScrollInterval([firstVisible.startTimestamp, lastVisible.endTimestamp]);
            }
        };

        const observer = new IntersectionObserver(updateScrollInterval, {
            root: null,
            rootMargin: '0px',
            threshold: 0.1,
        });

        Array.from(containerRef.current.children).forEach((child) => {
            observer.observe(child);
        });

        return () => observer.disconnect();
    }, [speakerSegments, debouncedSetCurrentScrollInterval]);

    if (speakerSegments.length === 0) {
        return <div className="container py-8">
            <ScrollText className="w-12 h-12 mx-auto text-muted-foreground" />
            <div className="text-center text-base text-muted-foreground py-8">
                Η απομαγνητοφώνηση δεν είναι ακόμη διαθέσιμη.
            </div>

        </div>
    }

    return (
        <div className="container" ref={containerRef} >
            {speakerSegments.map((segment, index: number) =>
                <SpeakerSegmentWrapper key={index} segment={segment} index={index} speakerSegments={speakerSegments} />
            )}
        </div>
    );
}

function SpeakerSegmentWrapper({ segment, index, speakerSegments }: { segment: TranscriptType[number], index: number, speakerSegments: SpeakerSegmentType[] }) {
    const { ref, inView } = useInView({
        threshold: 0,
        root: null,
        rootMargin: '200px', // Increase this value to load more segments
    });

    const { inView: prevInView } = useInView({
        threshold: 0,
        root: null,
        rootMargin: '200px',
    });

    const { inView: nextInView } = useInView({
        threshold: 0,
        root: null,
        rootMargin: '200px',
    });

    const isPrevInView = index > 0 && prevInView;
    const isNextInView = index < speakerSegments.length - 1 && nextInView;

    const shouldRender = inView || isPrevInView || isNextInView;

    return (
        <div
            key={index}
            id={`speaker-segment-${index}`}
            ref={ref}
        >
            <SpeakerSegment
                segment={segment}
                renderMock={!shouldRender}
            />
        </div>
    );
}