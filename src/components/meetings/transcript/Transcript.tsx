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

export default function Transcript() {
    const { transcript: speakerSegments } = useCouncilMeetingData();
    const { setCurrentScrollInterval } = useVideo();
    const containerRef = useRef<HTMLDivElement>(null);

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