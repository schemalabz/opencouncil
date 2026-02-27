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
import { UnverifiedTranscriptBanner, BANNER_HEIGHT_FULL } from "./UnverifiedTranscriptBanner";

// Helper functions for speaker segment identification and parsing
const SPEAKER_SEGMENT_PREFIX = 'speaker-segment-';

const isSpeakerSegmentElement = (element: Element): boolean => {
    return Boolean(element.id && element.id.startsWith(SPEAKER_SEGMENT_PREFIX));
};

const parseSegmentId = (elementId: string): string => {
    return elementId.substring(SPEAKER_SEGMENT_PREFIX.length);
};

const createSegmentId = (segmentId: string): string => {
    return `${SPEAKER_SEGMENT_PREFIX}${segmentId}`;
};

export default function Transcript() {
    const { transcript: speakerSegments, getHighlight, taskStatus } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const { setCurrentScrollInterval, currentTime } = useVideo();
    const { enterEditMode, editingHighlight } = useHighlight();
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleSegments, setVisibleSegments] = useState<Set<string>>(new Set());
    const [bannerHeight, setBannerHeight] = useState(BANNER_HEIGHT_FULL);
    const searchParams = useSearchParams();
    
    // Join segments if not in edit mode
    const displayedSegments = useMemo(() => {
        return options.editable ? speakerSegments : joinTranscriptSegments(speakerSegments);
    }, [speakerSegments, options.editable]);

    // Check if transcript is unverified (humanReview not completed)
    const isUnverified = !taskStatus.humanReview;

    // Derive scroll state from visible segments - if first segment is not visible, we've scrolled
    const isScrolled = useMemo(() => {
        const firstSegmentId = displayedSegments[0]?.id;
        if (!firstSegmentId) return false;
        return visibleSegments.size > 0 && !visibleSegments.has(firstSegmentId);
    }, [visibleSegments, displayedSegments]);

    // Helper to calculate time interval from segment indices
    const calculateTimeInterval = useCallback((segmentIds: string[] | Set<string>): [number, number] | null => {
        const ids = Array.isArray(segmentIds) ? new Set(segmentIds) : segmentIds;
        const validSegments = displayedSegments.filter(segment => ids.has(segment.id));
        
        if (validSegments.length === 0) return null;
        
        const firstVisible = validSegments[0];
        const lastVisible = validSegments[validSegments.length - 1];
        return [firstVisible.startTimestamp, lastVisible.endTimestamp];
    }, [displayedSegments]);

    // Add effect to handle initial scroll position
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const timeParam = urlParams.get('t');

        if (timeParam && containerRef.current) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds)) {
                // Force an immediate scroll update
                const updateScrollInterval = () => {
                    const visibleIndices = Array.from(containerRef.current!.children)
                        .filter((child) => {
                            const rect = child.getBoundingClientRect();
                            return rect.top < window.innerHeight && rect.bottom >= 0;
                        })
                        .filter(isSpeakerSegmentElement)
                        .map((child) => parseSegmentId(child.id));

                    const interval = calculateTimeInterval(new Set(visibleIndices));
                    if (interval) {
                        setCurrentScrollInterval(interval);
                    }
                };

                // Update scroll interval after a short delay to ensure components are rendered
                setTimeout(updateScrollInterval, 100);
            }
        }
    }, [displayedSegments, setCurrentScrollInterval, calculateTimeInterval]);

    // Handle highlight editing initialization from URL
    useEffect(() => {
        const highlightId = searchParams.get('highlight');
        if (highlightId && highlightId !== editingHighlight?.id) {
            const highlight = getHighlight(highlightId);
            if (highlight) {
                enterEditMode(highlight);
            }
        }
    }, [searchParams, getHighlight, enterEditMode, editingHighlight?.id]);

    const debouncedSetCurrentScrollInterval = useMemo(
        () => debounce(setCurrentScrollInterval, 500),
        [setCurrentScrollInterval]
    );

    // Single intersection observer for tracking visible segments AND updating scroll interval
    const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
        let hasChanges = false;
        const updates: { id: string; visible: boolean }[] = [];

        entries.forEach((entry) => {
            const segmentId = parseSegmentId(entry.target.id);
            const isCurrentlyVisible = visibleSegments.has(segmentId);

            if (entry.isIntersecting && !isCurrentlyVisible) {
                updates.push({ id: segmentId, visible: true });
                hasChanges = true;
            } else if (!entry.isIntersecting && isCurrentlyVisible) {
                updates.push({ id: segmentId, visible: false });
                hasChanges = true;
            }
        });

        if (hasChanges) {
            const newVisibleSegments = new Set(visibleSegments);
            updates.forEach(({ id, visible }) => {
                if (visible) {
                    newVisibleSegments.add(id);
                } else {
                    newVisibleSegments.delete(id);
                }
            });

            setVisibleSegments(newVisibleSegments);

            // Update scroll interval with debouncing for performance
            const interval = calculateTimeInterval(newVisibleSegments);
            if (interval) {
                debouncedSetCurrentScrollInterval(interval);
            }
        }
    }, [visibleSegments, calculateTimeInterval, debouncedSetCurrentScrollInterval]);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new IntersectionObserver(handleIntersection, {
            root: null,
            rootMargin: '200px', // Load segments when they're 200px away from viewport
            threshold: 0,
        });

        // Only observe speaker segment elements, not other children like the banner
        Array.from(containerRef.current.children).forEach((child) => {
            if (isSpeakerSegmentElement(child)) {
                observer.observe(child);
            }
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
        <div className="container px-2 sm:px-4 md:px-6" ref={containerRef} style={isUnverified ? { '--banner-offset': bannerHeight } as React.CSSProperties : undefined}>
            {isUnverified && (
                <UnverifiedTranscriptBanner 
                    isScrolled={isScrolled}
                    onBannerHeightChange={setBannerHeight}
                />
            )}
            {displayedSegments.map((segment, index: number) => {
                const previousSegmentId = displayedSegments[index - 1]?.id;
                const nextSegmentId = displayedSegments[index + 1]?.id;
                // Determine if this segment should be fully rendered
                const shouldRender = visibleSegments.has(segment.id) ||
                    (previousSegmentId ? visibleSegments.has(previousSegmentId) : false) ||
                    (nextSegmentId ? visibleSegments.has(nextSegmentId) : false);

                return (
                    <div
                        key={segment.id}
                        id={createSegmentId(segment.id)}
                    >
                        <SpeakerSegment
                            segment={segment}
                            renderMock={!shouldRender}
                            isFirstSegment={index === 0}
                        />
                    </div>
                );
            })}
        </div>
    );
}
