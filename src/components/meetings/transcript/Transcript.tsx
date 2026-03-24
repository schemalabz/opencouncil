"use client";
import SpeakerSegment from "./SpeakerSegment";
import { useEffect, useRef, useMemo, useState } from 'react';
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

const parseSegmentIndex = (elementId: string): number => {
    return parseInt(elementId.split('-')[2], 10);
};

const createSegmentId = (index: number): string => {
    return `${SPEAKER_SEGMENT_PREFIX}${index}`;
};

export default function Transcript() {
    const { transcript: speakerSegments, getHighlight, taskStatus } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const t = useTranslations('Common');
    const { setCurrentScrollInterval } = useVideo();
    const { enterEditMode, editingHighlight } = useHighlight();
    const containerRef = useRef<HTMLDivElement>(null);
    const [bannerHeight, setBannerHeight] = useState(BANNER_HEIGHT_FULL);
    const [isScrolled, setIsScrolled] = useState(false);
    const searchParams = useSearchParams();

    // Check if transcript is unverified (humanReview not completed)
    const isUnverified = !taskStatus.humanReview;

    // Join segments if not in edit mode
    const displayedSegments = useMemo(() => {
        return options.editable ? speakerSegments : joinTranscriptSegments(speakerSegments);
    }, [speakerSegments, options.editable]);

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
            {displayedSegments.map((segment, index: number) => (
                <div
                    key={index}
                    id={createSegmentId(index)}
                    className="content-visibility-auto"
                    role="listitem"
                >
                    <SpeakerSegment
                        segment={segment}
                        isFirstSegment={index === 0}
                    />
                </div>
            ))}
            </div>
        </div>
    );
}
