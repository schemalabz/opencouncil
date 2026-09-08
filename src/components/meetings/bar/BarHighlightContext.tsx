"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useBarDataRef } from './BarDataContext';
import type { Interval } from '@/lib/utils/barTimeline';

export interface BarHighlight {
    /** what set it — a subject id, a person id, a pair key; dedupes re-sets */
    key: string;
    ranges: Interval[];
}

interface BarHighlightState {
    /** the page's standing scope — e.g. the subject page's own subject */
    page: BarHighlight | null;
    /** a transient hover — wins over the page scope while present */
    hover: BarHighlight | null;
}

interface BarHighlightActions {
    setPageHighlight: (h: BarHighlight | null) => void;
    setHoverHighlight: (h: BarHighlight | null) => void;
    /** Drops the hover only when it still belongs to `key` — the unmount cleanup. */
    clearHoverIf: (key: string) => void;
}

const StateContext = createContext<BarHighlightState>({ page: null, hover: null });

// Inert defaults: a component carrying hover wiring (SubjectRow, the
// contribution cards) also renders on pages with no bar — search, person,
// party — where the handlers must simply do nothing.
const NOOP_ACTIONS: BarHighlightActions = {
    setPageHighlight: () => {},
    setHoverHighlight: () => {},
    clearHoverIf: () => {},
};
const ActionsContext = createContext<BarHighlightActions>(NOOP_ACTIONS);

/**
 * One mechanism, many sources: the bar dims whatever falls outside the
 * effective ranges; sources (a subject page, a hovered row, a hovered
 * speaker) only ever hand over interval lists. The actions context is
 * identity-stable so wiring a hover into a memoized card costs nothing.
 */
export function BarHighlightProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<BarHighlightState>({ page: null, hover: null });

    const actions = useMemo<BarHighlightActions>(() => ({
        setPageHighlight: page => setState(prev =>
            (prev.page?.key === page?.key && prev.page?.ranges === page?.ranges) ? prev : { ...prev, page }),
        // A key's ranges come from one memoized map, so same key means same
        // highlight — dedupe re-sets instead of re-rendering every consumer.
        setHoverHighlight: hover => setState(prev =>
            prev.hover?.key === hover?.key ? prev : { ...prev, hover }),
        clearHoverIf: key => setState(prev =>
            prev.hover?.key === key ? { ...prev, hover: null } : prev),
    }), []);

    return (
        <ActionsContext.Provider value={actions}>
            <StateContext.Provider value={state}>{children}</StateContext.Provider>
        </ActionsContext.Provider>
    );
}

/** The bar's read: the ranges to keep lit, or null for "everything lit". */
export function useBarHighlight(): BarHighlight | null {
    const { page, hover } = useContext(StateContext);
    return hover ?? page;
}

export function useBarHighlightActions(): BarHighlightActions {
    return useContext(ActionsContext);
}

type HoverHandlers = {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
};

/**
 * The wiring behind every hover source. `resolve` runs when the pointer
 * arrives, not while rendering: the interval maps change with every transcript
 * edit, and a segment that subscribed to them would re-render on each one.
 * Each source passes a memoized resolver, so the handlers stay identity-stable
 * for the memoized rows and cards that spread them.
 */
function useHoverHandlers(key: string | null, resolve: () => Interval[] | undefined): HoverHandlers {
    const { setHoverHighlight, clearHoverIf } = useBarHighlightActions();

    // Browsers fire no mouseleave for an element that unmounts under the
    // pointer (a clicked row navigating away, a tapped header collapsing), so
    // the leave must also run as unmount cleanup or the bar stays dimmed.
    useEffect(() => {
        if (!key) return;
        return () => clearHoverIf(key);
    }, [key, clearHoverIf]);

    return useMemo(() => {
        const enter = () => {
            if (!key) return;
            const ranges = resolve();
            // Empty intervals still mean "this is what the pointer is on":
            // clear, rather than keep a sibling's stale highlight alive.
            setHoverHighlight(ranges && ranges.length > 0 ? { key, ranges } : null);
        };
        const leave = () => setHoverHighlight(null);
        return { onMouseEnter: enter, onMouseLeave: leave, onFocus: enter, onBlur: leave };
    }, [key, resolve, setHoverHighlight]);
}

/** Hover handlers lighting a subject's runs on the bar. */
export function useSubjectBarHover(subjectId: string | null): HoverHandlers {
    const data = useBarDataRef();
    const resolve = useCallback(
        () => subjectId ? data.current.intervalsBySubject.get(subjectId) : undefined,
        [data, subjectId],
    );
    return useHoverHandlers(subjectId, resolve);
}

/** Hover handlers lighting a speaker's runs on the bar. */
export function useSpeakerBarHover(personId: string | null): HoverHandlers {
    const data = useBarDataRef();
    const resolve = useCallback(
        () => personId ? data.current.intervalsBySpeaker.get(personId) : undefined,
        [data, personId],
    );
    return useHoverHandlers(personId, resolve);
}

/** Hover handlers lighting one speaker's runs within one subject. */
export function useContributionBarHover(subjectId: string | null, personId: string | null): HoverHandlers {
    const data = useBarDataRef();
    const key = subjectId && personId ? `${subjectId}:${personId}` : null;
    const resolve = useCallback(
        () => key ? data.current.intervalsBySubjectSpeaker.get(key) : undefined,
        [data, key],
    );
    return useHoverHandlers(key, resolve);
}
