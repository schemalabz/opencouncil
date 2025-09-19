"use client";
import SpeakerSegment from "./SpeakerSegment";
import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useVideo } from "../VideoProvider";
import { debounce, joinTranscriptSegments } from '@/lib/utils';
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { ScrollText } from "lucide-react";
import { useTranscriptOptions } from "../options/OptionsContext";
import { useSearchParams } from "next/navigation";
import { useHighlight } from "../HighlightContext";

export default function Transcript() {
    const { transcript: speakerSegments, getHighlight } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const { setCurrentScrollInterval, currentTime } = useVideo();
    const { enterEditMode } = useHighlight();
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleSegments, setVisibleSegments] = useState<Set<number>>(new Set());
    const searchParams = useSearchParams();

    // Join segments if not in edit mode
    const displayedSegments = useMemo(() => {
        return options.editable ? speakerSegments : joinTranscriptSegments(speakerSegments);
    }, [speakerSegments, options.editable]);

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
                        .map((child) => displayedSegments[parseInt(child.id.split('-')[2])]);

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
    }, [displayedSegments, setCurrentScrollInterval]);

    // Handle highlight editing initialization from URL
    useEffect(() => {
        const highlightId = searchParams.get('highlight');
        if (highlightId) {
            const highlight = getHighlight(highlightId);
            if (highlight) {
                enterEditMode(highlight);
            }
        }
    }, [searchParams, getHighlight, enterEditMode]);

    const debouncedSetCurrentScrollInterval = useMemo(
        () => debounce(setCurrentScrollInterval, 500),
        [setCurrentScrollInterval]
    );

    // Single intersection observer for tracking visible segments AND updating scroll interval
    const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
        let hasChanges = false;
        const updates: { index: number; visible: boolean }[] = [];

        entries.forEach((entry) => {
            const segmentIndex = parseInt(entry.target.id.split('-')[2]);
            const isCurrentlyVisible = visibleSegments.has(segmentIndex);

            if (entry.isIntersecting && !isCurrentlyVisible) {
                updates.push({ index: segmentIndex, visible: true });
                hasChanges = true;
            } else if (!entry.isIntersecting && isCurrentlyVisible) {
                updates.push({ index: segmentIndex, visible: false });
                hasChanges = true;
            }
        });

        if (hasChanges) {
            const newVisibleSegments = new Set(visibleSegments);
            updates.forEach(({ index, visible }) => {
                if (visible) {
                    newVisibleSegments.add(index);
                } else {
                    newVisibleSegments.delete(index);
                }
            });

            setVisibleSegments(newVisibleSegments);

            // Update scroll interval with debouncing for performance
            const visibleSegmentsList = Array.from(newVisibleSegments)
                .sort((a, b) => a - b)
                .map(index => displayedSegments[index])
                .filter(Boolean); // Filter out any undefined segments

            if (visibleSegmentsList.length > 0) {
                const firstVisible = visibleSegmentsList[0];
                const lastVisible = visibleSegmentsList[visibleSegmentsList.length - 1];
                debouncedSetCurrentScrollInterval([firstVisible.startTimestamp, lastVisible.endTimestamp]);
            }
        }
    }, [visibleSegments, displayedSegments, debouncedSetCurrentScrollInterval]);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new IntersectionObserver(handleIntersection, {
            root: null,
            rootMargin: '200px', // Load segments when they're 200px away from viewport
            threshold: 0,
        });

        Array.from(containerRef.current.children).forEach((child) => {
            observer.observe(child);
        });

        return () => observer.disconnect();
    }, [displayedSegments, handleIntersection]);

    if (displayedSegments.length === 0) {
        return <div className="container py-8">
            <ScrollText className="w-12 h-12 mx-auto text-muted-foreground" />
            <div className="text-center text-base text-muted-foreground py-8">
                Η απομαγνητοφώνηση δεν είναι ακόμη διαθέσιμη.
            </div>
        </div>
    }

    return (
        <div className="container" ref={containerRef} >
            {displayedSegments.map((segment, index: number) => {
                // Determine if this segment should be fully rendered
                const shouldRender = visibleSegments.has(index) ||
                    visibleSegments.has(index - 1) ||
                    visibleSegments.has(index + 1);

                return (
                    <div
                        key={index}
                        id={`speaker-segment-${index}`}
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