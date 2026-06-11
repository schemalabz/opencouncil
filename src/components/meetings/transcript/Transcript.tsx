"use client";
import SpeakerSegment from "./SpeakerSegment";
import SegmentContext from "./SegmentContext";
import { useEffect, useRef, useMemo, useState } from 'react';
import { useVideo, useVideoActions } from "../VideoProvider";
import { debounce, joinTranscriptSegments } from '@/lib/utils';
import { useCouncilMeetingData } from "../CouncilMeetingDataContext";
import { Clock, ScrollText } from "lucide-react";
import { useTranscriptOptions } from "../options/OptionsContext";
import { useSearchParams } from "next/navigation";
import { useHighlight } from "../HighlightContext";
import { useTranslations } from 'next-intl';
import { UnverifiedTranscriptBanner, BANNER_HEIGHT_FULL } from "./UnverifiedTranscriptBanner";
import { UtteranceContextMenu } from "./UtteranceContextMenu";
import { useViewMode } from "@/hooks/useViewMode";
import { useFisheyeCenter } from "@/hooks/useFisheyeCenter";
import { fisheyeModeForDistance } from "@/lib/utils/fisheye";
import FisheyeToggle from "./FisheyeToggle";

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
    const { transcript: speakerSegments, getHighlight, taskStatus, transcriptHiddenForReview } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const tTranscript = useTranslations('transcript');
    const t = useTranslations('Common');
    const { setCurrentScrollInterval } = useVideo();
    const { enterEditMode, editingHighlight } = useHighlight();
    const containerRef = useRef<HTMLDivElement>(null);
    const [bannerHeight, setBannerHeight] = useState(BANNER_HEIGHT_FULL);
    const [isScrolled, setIsScrolled] = useState(false);
    const searchParams = useSearchParams();
    const [viewMode] = useViewMode();
    const isFisheye = viewMode === 'fisheye' && !options.editable;
    const { currentTimeRef } = useVideoActions();
    const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);

    // Check if transcript is unverified (humanReview not completed)
    const isUnverified = !taskStatus.humanReview && !options.editsAllowed;

    // Join segments if not in edit mode
    const displayedSegments = useMemo(() => {
        return options.editable ? speakerSegments : joinTranscriptSegments(speakerSegments);
    }, [speakerSegments, options.editable]);

    // Store displayedSegments in a ref for stable callbacks
    const displayedSegmentsRef = useRef(displayedSegments);
    displayedSegmentsRef.current = displayedSegments;

    // Track scroll state for banner minimization via scroll container
    useEffect(() => {
        const container = containerRef.current?.closest('[data-scroll-container]');
        if (!container) return;

        const handleScroll = () => {
            setIsScrolled(container.scrollTop > 50);
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    // Track segment containing the current playback time. Polled from a ref to
    // avoid re-rendering the transcript on every video tick. Only enabled in
    // fisheye mode — default view doesn't read it.
    useEffect(() => {
        if (!isFisheye) {
            setActiveSegmentIndex(null);
            return;
        }
        const recompute = () => {
            const now = currentTimeRef.current;
            const segs = displayedSegmentsRef.current;
            if (!segs.length) {
                setActiveSegmentIndex(null);
                return;
            }
            // Linear scan is fine: invoked at 4Hz, segments rarely exceed a few hundred.
            let found: number | null = null;
            for (let i = 0; i < segs.length; i++) {
                if (now >= segs[i].startTimestamp && now <= segs[i].endTimestamp) {
                    found = i;
                    break;
                }
                if (segs[i].startTimestamp > now) {
                    found = Math.max(0, i - 1);
                    break;
                }
            }
            if (found === null) found = segs.length - 1;
            setActiveSegmentIndex(prev => (prev === found ? prev : found));
        };
        recompute();
        const id = setInterval(recompute, 250);
        return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFisheye, displayedSegments.length]);

    const centerIndex = useFisheyeCenter(activeSegmentIndex);

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

    // Store setCurrentScrollInterval in a ref for stable access from observer callback
    const setCurrentScrollIntervalRef = useRef(setCurrentScrollInterval);
    setCurrentScrollIntervalRef.current = setCurrentScrollInterval;

    const debouncedSetCurrentScrollInterval = useMemo(
        () => debounce((interval: [number, number]) => {
            setCurrentScrollIntervalRef.current(interval);
        }, 500),
        []
    );

    // IntersectionObserver ONLY for currentScrollInterval tracking (used by CurrentTimeButton).
    // No state updates — only refs and debounced callbacks. This means scrolling causes
    // ZERO React re-renders.
    useEffect(() => {
        if (!containerRef.current) return;

        const visibleSegments = new Set<number>();

        const observer = new IntersectionObserver((entries) => {
            let hasChanges = false;

            entries.forEach((entry) => {
                if (!isSpeakerSegmentElement(entry.target)) return;
                const segmentIndex = parseSegmentIndex(entry.target.id);

                if (entry.isIntersecting && !visibleSegments.has(segmentIndex)) {
                    visibleSegments.add(segmentIndex);
                    hasChanges = true;
                } else if (!entry.isIntersecting && visibleSegments.has(segmentIndex)) {
                    visibleSegments.delete(segmentIndex);
                    hasChanges = true;
                }
            });

            if (hasChanges) {
                const indices = Array.from(visibleSegments).sort((a, b) => a - b);
                const segments = indices.map(i => displayedSegmentsRef.current[i]).filter(Boolean);
                if (segments.length > 0) {
                    debouncedSetCurrentScrollInterval([
                        segments[0].startTimestamp,
                        segments[segments.length - 1].endTimestamp,
                    ]);
                }
            }
        }, {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [displayedSegments]);

    if (displayedSegments.length === 0) {
        if (transcriptHiddenForReview) {
            return <div className="container py-8">
                <Clock className="w-12 h-12 mx-auto text-muted-foreground" />
                <div className="text-center text-base font-medium text-muted-foreground pt-4">
                    {tTranscript('hiddenForReview.title')}
                </div>
                <div className="text-center text-sm text-muted-foreground pt-2">
                    {tTranscript('hiddenForReview.description')}
                </div>
            </div>
        }
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
            {!options.editable && (
                <div className="flex justify-end pt-2 pb-1">
                    <FisheyeToggle />
                </div>
            )}
            <UtteranceContextMenu>
                <div ref={containerRef} role="list" aria-label={t('transcript')}>
                {displayedSegments.map((segment, index: number) => {
                    const mode = isFisheye && centerIndex !== null
                        ? fisheyeModeForDistance(index - centerIndex)
                        : 'focus';
                    return (
                        <div
                            key={index}
                            id={createSegmentId(index)}
                            className="content-visibility-auto"
                            role="listitem"
                        >
                            {mode === 'context' ? (
                                <SegmentContext segment={segment} />
                            ) : (
                                <SpeakerSegment
                                    segment={segment}
                                    isFirstSegment={index === 0}
                                />
                            )}
                        </div>
                    );
                })}
                </div>
            </UtteranceContextMenu>
        </div>
    );
}
