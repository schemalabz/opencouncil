"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useBarData } from './BarDataContext';
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
}

const StateContext = createContext<BarHighlightState>({ page: null, hover: null });

// Inert defaults: a component carrying hover wiring (SubjectRow, the
// contribution cards) also renders on pages with no bar — search, person,
// party — where the handlers must simply do nothing.
const NOOP_ACTIONS: BarHighlightActions = {
    setPageHighlight: () => {},
    setHoverHighlight: () => {},
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
        setHoverHighlight: hover => setState(prev =>
            (prev.hover?.key === hover?.key) ? (hover === null && prev.hover === null ? prev : { ...prev, hover }) : { ...prev, hover }),
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

function useHoverHandlers(key: string | null, resolve: () => Interval[] | undefined): HoverHandlers {
    const { setHoverHighlight } = useBarHighlightActions();
    // resolve reads the freshest interval maps without being a dependency
    const resolveRef = useRef(resolve);
    resolveRef.current = resolve;

    return useMemo(() => {
        const enter = () => {
            if (!key) return;
            const ranges = resolveRef.current();
            if (ranges && ranges.length > 0) setHoverHighlight({ key, ranges });
        };
        const leave = () => setHoverHighlight(null);
        return { onMouseEnter: enter, onMouseLeave: leave, onFocus: enter, onBlur: leave };
    }, [key, setHoverHighlight]);
}

/** Hover handlers lighting a subject's runs on the bar. */
export function useSubjectBarHover(subjectId: string | null): HoverHandlers {
    const data = useBarData();
    return useHoverHandlers(subjectId, () => subjectId ? data.intervalsBySubject.get(subjectId) : undefined);
}

/** Hover handlers lighting a speaker's runs on the bar. */
export function useSpeakerBarHover(personId: string | null): HoverHandlers {
    const data = useBarData();
    return useHoverHandlers(personId, () => personId ? data.intervalsBySpeaker.get(personId) : undefined);
}

/** Hover handlers lighting one speaker's runs within one subject. */
export function useContributionBarHover(subjectId: string | null, personId: string | null): HoverHandlers {
    const data = useBarData();
    const key = subjectId && personId ? `${subjectId}:${personId}` : null;
    return useHoverHandlers(key, () => key ? data.intervalsBySubjectSpeaker.get(key) : undefined);
}
