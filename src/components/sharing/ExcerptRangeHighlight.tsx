'use client';

import { createContext, useContext, useEffect, useState, type RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { digestExcerpt, parseExcerptSelector, selectExcerptRuns, type ExcerptSource } from '@/lib/sharing/excerptSelector';

const HighlightedUtterances = createContext<ReadonlySet<string>>(new Set());
export const useExcerptHighlighted = (id: string) => useContext(HighlightedUtterances).has(id);

export function ExcerptRangeHighlight({ sources, rootRef, children }: { sources: ExcerptSource[]; rootRef: RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
    const searchParams = useSearchParams();
    const [highlightedIds, setHighlightedIds] = useState<ReadonlySet<string>>(new Set());
    useEffect(() => {
        let cancelled = false;
        setHighlightedIds(new Set());
        const selector = parseExcerptSelector(new URLSearchParams(searchParams.toString()));
        if (!selector) return;
        const first = sources.findIndex(source => source.id === selector.firstUtteranceId);
        const last = sources.findIndex(source => source.id === selector.lastUtteranceId);
        if (first < 0 || last < first) return;
        const selected = sources.slice(first, last + 1);
        const runs = selectExcerptRuns(selected);
        if (!runs) return;
        void digestExcerpt(runs).then(digest => {
            if (cancelled || digest !== selector.digest) return;
            setHighlightedIds(new Set(selected.map(source => source.id)));
            requestAnimationFrame(() => {
                if (cancelled) return;
                const element = rootRef.current?.querySelector<HTMLElement>(`[data-utterance-id="${selector.firstUtteranceId}"]`);
                element?.scrollIntoView({ block: 'center', behavior: 'instant' });
            });
        }).catch(() => { /* Unsupported browser crypto leaves the ordinary transcript available. */ });
        return () => { cancelled = true; };
    }, [searchParams, sources, rootRef]);
    return <HighlightedUtterances.Provider value={highlightedIds}>{children}</HighlightedUtterances.Provider>;
}
