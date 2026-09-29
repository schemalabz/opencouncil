'use client';

import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useVideoActions } from '@/components/meetings/VideoProvider';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { toast } from '@/hooks/use-toast';
import { digestExcerpt, parseExcerptSelector, selectExcerptRuns, excerptSourceIsVisible, type ExcerptSource } from '@/lib/sharing/excerptSelector';
import { subjectOfPassage } from '@/lib/sharing/passageSubject';
import { captureSharingEvent } from '@/lib/analytics/sharing';

const NONE: ReadonlySet<string> = new Set();
const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every(id => b.has(id));
const HighlightedUtterances = createContext<ReadonlySet<string>>(NONE);
export const useExcerptHighlighted = (id: string) => useContext(HighlightedUtterances).has(id);

export function ExcerptRangeHighlight({ sources, rootRef, children }: { sources: ExcerptSource[]; rootRef: RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
    const searchParams = useSearchParams();
    const t = useTranslations('sharing');
    const { seekToWithoutScroll } = useVideoActions();
    const meetingData = useCouncilMeetingData();
    const { meeting } = meetingData;
    // Read when the reader lands, so that a new subject or review does not run the check again.
    const meetingDataRef = useRef(meetingData);
    meetingDataRef.current = meetingData;
    const [highlightedIds, setHighlightedIds] = useState(NONE);
    // Each transcript edit rebuilds the sources. The reader lands on a shared
    // excerpt once, so an edit elsewhere does not pull them back to it.
    const landedDigest = useRef<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        // A new set, even an equal one, re-renders every utterance.
        const show = (ids: ReadonlySet<string>) => setHighlightedIds(previous => sameIds(previous, ids) ? previous : ids);
        const selector = parseExcerptSelector(new URLSearchParams(searchParams.toString()));
        if (!selector || selector.cityId !== meeting.cityId || selector.meetingId !== meeting.id) {
            show(NONE);
            return;
        }
        const first = sources.findIndex(source => source.id === selector.firstUtteranceId);
        const last = sources.findIndex(source => source.id === selector.lastUtteranceId);
        const selected = first >= 0 && last >= first ? sources.slice(first, last + 1).filter(source => excerptSourceIsVisible(source, selector.maxDrift ?? Infinity)) : [];
        const runs = selectExcerptRuns(selected);
        void (runs ? digestExcerpt(runs) : Promise.resolve(null)).then(digest => {
            if (cancelled) return;
            const verified = digest === selector.digest;
            show(verified ? new Set(selected.map(source => source.id)) : NONE);
            if (landedDigest.current === selector.digest) return;
            requestAnimationFrame(() => {
                if (cancelled) return;
                landedDigest.current = selector.digest;
                if (verified) {
                    const { transcript, subjects, taskStatus } = meetingDataRef.current;
                    const subject = subjectOfPassage(transcript.flatMap(segment => segment.utterances), new Set(selected.map(source => source.id)), subjects, selector.maxDrift);
                    captureSharingEvent('sharing_received', { content_type: 'excerpt', surface: 'transcript', city_id: selector.cityId, meeting_id: selector.meetingId, subject_id: subject?.id, locale: selector.textLocale, reviewed: taskStatus.humanReview, utterance_count: selected.length });
                } else toast({ title: t('sourceChangedTitle'), description: t('sourceChangedInTranscript') });
                // A changed passage keeps its place when its first utterance still exists.
                const start = sources[first];
                if (!start) return;
                seekToWithoutScroll(start.startTimestamp);
                const element = rootRef.current?.querySelector<HTMLElement>(`[data-utterance-id="${start.id}"]`);
                if (!element) return;
                // Focus takes screen readers and keyboards to the passage too, not only the viewport.
                element.tabIndex = -1;
                element.focus({ preventScroll: true });
                element.scrollIntoView({ block: 'center', behavior: 'instant' });
            });
        }).catch(() => { /* Unsupported browser crypto leaves the ordinary transcript available. */ });
        return () => { cancelled = true; };
    }, [searchParams, sources, rootRef, meeting.cityId, meeting.id, seekToWithoutScroll, t]);
    return <HighlightedUtterances.Provider value={highlightedIds}>{children}</HighlightedUtterances.Provider>;
}
