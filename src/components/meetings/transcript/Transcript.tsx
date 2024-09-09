import { SpeakerSegment as SpeakerSegmentType } from "@prisma/client";
import SpeakerSegment from "./SpeakerSegment";
import { useEffect, useRef } from 'react';
import { useVideo } from "../VideoProvider";
import { Utterance } from "@prisma/client";
import { Transcript as TranscriptType } from "@/lib/db/transcript";
import { useInView } from 'react-intersection-observer';

export default function Transcript({ speakerSegments }: { speakerSegments: TranscriptType }) {
    const { setCurrentScrollInterval } = useVideo();
    const containerRef = useRef<HTMLDivElement>(null);

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
                setCurrentScrollInterval([firstVisible.startTimestamp, lastVisible.endTimestamp]);
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
    }, [speakerSegments, setCurrentScrollInterval]);

    return (
        <div className="container" ref={containerRef}>
            {speakerSegments.map((segment, index: number) => {
                const { ref, inView } = useInView({
                    threshold: 0,
                    root: null,
                    rootMargin: '200px', // Increase this value to load more segments
                });

                const prevInView = index > 0 && useInView({
                    threshold: 0,
                    root: null,
                    rootMargin: '200px',
                }).inView;

                const nextInView = index < speakerSegments.length - 1 && useInView({
                    threshold: 0,
                    root: null,
                    rootMargin: '200px',
                }).inView;

                const shouldRender = inView || prevInView || nextInView;

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
            })}
        </div>
    );
}