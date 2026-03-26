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
import { useTranslations } from 'next-intl';
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
    const t = useTranslations('Common');
    const { setCurrentScrollInterval } = useVideo();
    const { enterEditMode, editingHighlight } = useHighlight();
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleSegments, setVisibleSegments] = useState<Set<string>>(new Set());
    const [bannerHeight, setBannerHeight] = useState(BANNER_HEIGHT_FULL);
    const searchParams = useSearchParams();
    // Check if transcript is unverified (humanReview not completed)
    const isUnverified = !taskStatus.humanReview;

    // Join segments if not in edit mode
    const displayedSegments = useMemo(() => {
        return options.editable ? speakerSegments : joinTranscriptSegments(speakerSegments);
    }, [speakerSegments, options.editable]);

    // Derive scroll state from visible segments - if first segment is not visible, we've scrolled
    const isScrolled = useMemo(() => {
        const firstSegmentId = displayedSegments[0]?.id;
        if (!firstSegmentId) return false;
        return visibleSegments.size > 0 && !visibleSegments.has(firstSegmentId);
    }, [visibleSegments, displayedSegments]);

    // Helper to calculate time interval from segment identities
    const calculateTimeInterval = useCallback((segmentIds: string[] | Set<string>): [number, number] | null => {
        const ids = Array.isArray(segmentIds) ? new Set(segmentIds) : segmentIds;
        const validSegments = displayedSegments.filter(segment => ids.has(segment.id));
        
        if (validSegments.length === 0) return null;
        
        const firstVisible = validSegments[0];
        const lastVisible = validSegments[validSegments.length - 1];
        return [firstVisible.startTimestamp, lastVisible.endTimestamp];
    }, [displayedSegments]);

    // Add effect to handle initial scroll position/interval
    useEffect(() => {
        const timeParam = searchParams.get('t');
        if (timeParam && containerRef.current) {
            const seconds = parseInt(timeParam, 10);
            if (!isNaN(seconds)) {
                // Force an immediate scroll update
                const updateScrollInterval = () => {
                    if (!containerRef.current) return;
                    const visibleIds = Array.from(containerRef.current.children)
                        .filter((child) => {
                            const rect = child.getBoundingClientRect();
                            return rect.top < window.innerHeight && rect.bottom >= 0;
                        })
                        .filter(isSpeakerSegmentElement)
                        .map((child) => parseSegmentId(child.id));

                    const interval = calculateTimeInterval(new Set(visibleIds));
                    if (interval) {
                        setCurrentScrollInterval(interval);
                    }
                };

                // Update scroll interval after a short delay to ensure components are rendered
                const timeoutId = setTimeout(updateScrollInterval, 100);
                return () => clearTimeout(timeoutId);
            }
        }
    }, [searchParams, setCurrentScrollInterval, calculateTimeInterval]);

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

    // Store displayedSegments in a ref for stable IntersectionObserver callback
    const displayedSegmentsRef = useRef(displayedSegments);
    displayedSegmentsRef.current = displayedSegments;

    // Store setCurrentScrollInterval in a ref for stable access from observer callback
    const setCurrentScrollIntervalRef = useRef(setCurrentScrollInterval);
    setCurrentScrollIntervalRef.current = setCurrentScrollInterval;

    const debouncedSetScrollInterval = useMemo(
        () => debounce((interval: [number, number]) => {
            setCurrentScrollIntervalRef.current(interval);
        }, 500),
        []
    );

    // Single intersection observer for tracking visible segments
    const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
        const updates: { id: string; visible: boolean }[] = [];

        entries.forEach((entry) => {
            const segmentId = parseSegmentId(entry.target.id);
            updates.push({ id: segmentId, visible: entry.isIntersecting });
        });

        setVisibleSegments(prev => {
            const next = new Set(prev);
            let actuallyChanged = false;
            updates.forEach(({ id, visible }) => {
                if (visible && !next.has(id)) {
                    next.add(id);
                    actuallyChanged = true;
                } else if (!visible && next.has(id)) {
                    next.delete(id);
                    actuallyChanged = true;
                }
            });
            return actuallyChanged ? next : prev;
        });
    }, []);

    // Effect to update scroll interval when visible segments change.
    // If all segments are evicted (e.g. the only visible segment was deleted),
    // reset to [0, 0] so the stale interval doesn't linger until the observer fires.
    useEffect(() => {
        const interval = calculateTimeInterval(visibleSegments);
        if (interval) {
            debouncedSetScrollInterval(interval);
        } else if (visibleSegments.size === 0) {
            debouncedSetScrollInterval.cancel();  // prevent stale debounced call from overwriting reset
            setCurrentScrollInterval([0, 0]);  // bypass debounce: clear immediately
        }
    }, [visibleSegments, calculateTimeInterval, debouncedSetScrollInterval, setCurrentScrollInterval]);

    // Evict stale IDs when displayedSegments changes (e.g. after segment deletion/reorder)
    useEffect(() => {
        const currentIds = new Set(displayedSegments.map(s => s.id));
        setVisibleSegments(prev => {
            const next = new Set([...prev].filter(id => currentIds.has(id)));
            return next.size !== prev.size ? next : prev;
        });
    }, [displayedSegments]);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new IntersectionObserver(handleIntersection, {
            root: null,
            rootMargin: '200px',
            threshold: 0,
        });

        Array.from(containerRef.current.children).forEach((child) => {
            if (isSpeakerSegmentElement(child)) {
                observer.observe(child);
            }
        });

        return () => observer.disconnect();
    }, [handleIntersection]);

    if (displayedSegments.length === 0) {
        return <div className="container py-8">
            <ScrollText className="w-12 h-12 mx-auto text-muted-foreground" />
            <div className="text-center text-base text-muted-foreground py-8">
                Η απομαγνητοφώνηση δεν είναι ακόμη διαθέσιμη.
            </div>
        </div>
    }

    return (
        <div className="container px-2 sm:px-4 md:px-6" style={isUnverified ? { '--banner-offset': bannerHeight } as React.CSSProperties : undefined}>
            <h2 className="sr-only">{t('transcript')}</h2>
            {isUnverified && (
                <UnverifiedTranscriptBanner
                    isScrolled={isScrolled}
                    onBannerHeightChange={setBannerHeight}
                />
            )}
            <div ref={containerRef} role="list" aria-label={t('transcript')}>
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
                            className="content-visibility-auto"
                            role="listitem"
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
        </div>
    );
}
