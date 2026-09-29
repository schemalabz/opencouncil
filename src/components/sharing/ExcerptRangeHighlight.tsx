'use client';

import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { digestExcerpt, parseExcerptSelector, selectExcerptRuns, excerptSourceIsVisible, type ExcerptSource } from '@/lib/sharing/excerptSelector';

const NONE: ReadonlySet<string> = new Set();
const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every(id => b.has(id));
const HighlightedUtterances = createContext<ReadonlySet<string>>(NONE);
export const useExcerptHighlighted = (id: string) => useContext(HighlightedUtterances).has(id);

export function ExcerptRangeHighlight({ sources, rootRef, children }: { sources: ExcerptSource[]; rootRef: RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
    const searchParams = useSearchParams();
    const [highlightedIds, setHighlightedIds] = useState(NONE);
    // Each transcript edit rebuilds the sources. The reader lands on a shared
    // excerpt once, so an edit elsewhere does not pull them back to it.
    const landedDigest = useRef<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        // A new set, even an equal one, re-renders every utterance.
        const show = (ids: ReadonlySet<string>) => setHighlightedIds(previous => sameIds(previous, ids) ? previous : ids);
        const selector = parseExcerptSelector(new URLSearchParams(searchParams.toString()));
        const first = selector ? sources.findIndex(source => source.id === selector.firstUtteranceId) : -1;
        const last = selector ? sources.findIndex(source => source.id === selector.lastUtteranceId) : -1;
        const selected = first >= 0 && last >= first ? sources.slice(first, last + 1).filter(source => excerptSourceIsVisible(source, selector?.maxDrift ?? Infinity)) : [];
        const runs = selectExcerptRuns(selected);
        if (!selector || !runs) {
            show(NONE);
            return;
        }
        void digestExcerpt(runs).then(digest => {
            if (cancelled) return;
            show(digest === selector.digest ? new Set(selected.map(source => source.id)) : NONE);
            if (digest !== selector.digest || landedDigest.current === digest) return;
            requestAnimationFrame(() => {
                if (cancelled) return;
                landedDigest.current = digest;
                const element = rootRef.current?.querySelector<HTMLElement>(`[data-utterance-id="${selector.firstUtteranceId}"]`);
                element?.scrollIntoView({ block: 'center', behavior: 'instant' });
            });
        }).catch(() => { /* Unsupported browser crypto leaves the ordinary transcript available. */ });
        return () => { cancelled = true; };
    }, [searchParams, sources, rootRef]);
    return <HighlightedUtterances.Provider value={highlightedIds}>{children}</HighlightedUtterances.Provider>;
}
