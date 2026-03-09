"use client";
import SpeakerSegment from "./SpeakerSegment";
import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useVideo } from "../VideoProvider";
import { debounce, joinTranscriptSegments } from '@/lib/utils';
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { ScrollText } from "lucide-react";
import { useTranscriptOptions } from "../options/OptionsContext";
import { useSearchParams, useRouter } from "next/navigation";
import { useHighlight } from "../HighlightContext";
import { UnverifiedTranscriptBanner, BANNER_HEIGHT_FULL } from "./UnverifiedTranscriptBanner";
import { getSegmentDisplayMode, SegmentDisplayMode } from '@/lib/utils/fisheye';
import { useTranslations } from 'next-intl';
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

// Helper functions for speaker segment identification and parsing
const SPEAKER_SEGMENT_PREFIX = 'speaker-segment-';

const isSpeakerSegmentElement = (element: Element): boolean => {
    return Boolean(element.id && element.id.startsWith(SPEAKER_SEGMENT_PREFIX));
};

const parseSegmentIndex = (elementId: string): number => {
    return parseInt(elementId.split('-')[2], 10);
};

const createSegmentId = (index: number): string => {
    return `${SPEAKER_SEGMENT_PREFIX}${index}`;
};

export default function Transcript() {
    const { transcript: speakerSegments, getHighlight, taskStatus } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const { setCurrentScrollInterval, currentTime } = useVideo();
    const { enterEditMode, editingHighlight } = useHighlight();
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleSegments, setVisibleSegments] = useState<Set<number>>(new Set());
    const [bannerHeight, setBannerHeight] = useState(BANNER_HEIGHT_FULL);
    const searchParams = useSearchParams();
    const router = useRouter();
    const t = useTranslations('transcript.viewMode');
    
    // Fish-eye mode state from URL
    const isFishEyeMode = searchParams.get('mode') === 'fisheye';
    
    // Toggle fish-eye mode without page reload
    const toggleFishEyeMode = useCallback(() => {
        const newMode = isFishEyeMode ? 'default' : 'fisheye';
        const params = new URLSearchParams(searchParams.toString());
        if (newMode === 'fisheye') {
            params.set('mode', 'fisheye');
        } else {
            params.delete('mode');
        }
        router.replace(`?${params.toString()}`, { scroll: false });
    }, [isFishEyeMode, searchParams, router]);
    
    // Join segments if not in edit mode
    const displayedSegments = useMemo(() => {
        return options.editable ? speakerSegments : joinTranscriptSegments(speakerSegments);
    }, [speakerSegments, options.editable]);
    
    // Center index is driven by currentTime (playback) - NOT scroll position
    const centerIndex = useMemo(() => {
        if (!isFishEyeMode || displayedSegments.length === 0) return -1;
        
        // Find the segment closest to current playback time
        let closestIndex = 0;
        let smallestDiff = Infinity;
        
        displayedSegments.forEach((segment, index) => {
            if (currentTime >= segment.startTimestamp && currentTime < segment.endTimestamp) {
                closestIndex = index;
                smallestDiff = 0;
                return;
            }
            const diff = Math.abs(segment.startTimestamp - currentTime);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                closestIndex = index;
            }
        });
        
        return closestIndex;
    }, [currentTime, displayedSegments, isFishEyeMode]);
    
    // Check if transcript is unverified (humanReview not completed)
    const isUnverified = !taskStatus.humanReview;

    // Derive scroll state from visible segments - if first segment (index 0) is not visible, we've scrolled
    const isScrolled = useMemo(() => {
        return visibleSegments.size > 0 && !visibleSegments.has(0);
    }, [visibleSegments]);

    // Helper to calculate time interval from segment indices
    const calculateTimeInterval = useCallback((segmentIndices: number[] | Set<number>): [number, number] | null => {
        const indices = Array.isArray(segmentIndices) ? segmentIndices : Array.from(segmentIndices);
        const sortedIndices = indices.sort((a, b) => a - b);
        const validSegments = sortedIndices.map(index => displayedSegments[index]).filter(Boolean);
        
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
                        .map((child) => parseSegmentIndex(child.id));

                    const interval = calculateTimeInterval(visibleIndices);
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
        const updates: { index: number; visible: boolean }[] = [];

        entries.forEach((entry) => {
            const segmentIndex = parseSegmentIndex(entry.target.id);
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
            {/* Fish-eye mode toggle */}
            <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 py-2 border-b mb-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t('label')}</span>
                    <Button
                        variant={isFishEyeMode ? "default" : "outline"}
                        size="sm"
                        onClick={toggleFishEyeMode}
                        className="gap-2"
                    >
                        {isFishEyeMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {isFishEyeMode ? t('fisheye') : t('default')}
                    </Button>
                </div>
            </div>
            {isUnverified && (
                <UnverifiedTranscriptBanner 
                    isScrolled={isScrolled}
                    onBannerHeightChange={setBannerHeight}
                />
            )}
            {displayedSegments.map((segment, index: number) => {
                // Determine if this segment should be fully rendered
                const shouldRender = visibleSegments.has(index) ||
                    visibleSegments.has(index - 1) ||
                    visibleSegments.has(index + 1);

                // Calculate display mode for fish-eye
                const displayMode: SegmentDisplayMode = getSegmentDisplayMode(index, centerIndex, isFishEyeMode);

                return (
                    <div
                        key={index}
                        id={createSegmentId(index)}
                    >
                        <SpeakerSegment
                            segment={segment}
                            renderMock={!shouldRender}
                            isFirstSegment={index === 0}
                            displayMode={displayMode}
                        />
                    </div>
                );
            })}
        </div>
    );
}