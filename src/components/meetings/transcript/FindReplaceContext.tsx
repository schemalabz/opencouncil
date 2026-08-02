"use client";

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { escapeRegExp } from '@/lib/utils/findReplace';

export type Match = {
    utteranceId: string;
    segmentId: string;
    /** Index of this match in the global, transcript-ordered matches list. */
    globalIndex: number;
    /** Character offsets inside `Utterance.text`. */
    start: number;
    end: number;
};

type FindReplaceState = {
    isOpen: boolean;
    searchTerm: string;
    replaceTerm: string;
    caseSensitive: boolean;
    currentMatchIndex: number;
    matches: Match[];
};

export type FindReplaceApi = FindReplaceState & {
    open: () => void;
    /**
     * Open the panel and optionally pre-fill the search term. When pre-filled,
     * the panel focuses the replace input (search-already-known UX), otherwise
     * it focuses the search input.
     */
    openWithPrefill: (prefill: string | null) => void;
    /** Which input the panel should focus on next open. Consumed by the panel. */
    pendingFocus: 'search' | 'replace' | null;
    clearPendingFocus: () => void;
    close: () => void;
    toggle: () => void;
    setSearchTerm: (s: string) => void;
    setReplaceTerm: (s: string) => void;
    setCaseSensitive: (v: boolean) => void;
    nextMatch: () => void;
    prevMatch: () => void;
    setCurrentMatchIndex: (i: number) => void;
};

const FindReplaceContext = createContext<FindReplaceApi | undefined>(undefined);

// Separate per-utterance match store. UtteranceC subscribes via
// useUtteranceMatches(id) — only utterances whose match set changes re-render
// on each keystroke, not all 9K.
type MatchesByUtterance = Map<string, Match[]>;
type Subscriber = () => void;

const UtteranceMatchesContext = createContext<{
    subscribe: (utteranceId: string, cb: Subscriber) => () => void;
    getMatches: (utteranceId: string) => Match[] | undefined;
    getActiveIndex: () => number;
} | undefined>(undefined);

const EMPTY_MATCHES: Match[] = [];

export function FindReplaceProvider({ children }: { children: ReactNode }) {
    const { transcript } = useCouncilMeetingData();

    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTermState] = useState('');
    const [replaceTerm, setReplaceTerm] = useState('');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [pendingFocus, setPendingFocus] = useState<'search' | 'replace' | null>(null);

    // Compute matches when search term changes. We require ≥1 char so a single
    // accidental key in the search box doesn't trigger a full transcript scan,
    // but ≥1 already prevents the empty-string match infinite loop.
    const { matches, matchesByUtterance } = useMemo(() => {
        const byUtterance: MatchesByUtterance = new Map();
        const flat: Match[] = [];
        // Drop highlights as soon as the panel closes — otherwise yellow
        // marks linger on every matched utterance until the user manually
        // clears the search field.
        if (!isOpen || !searchTerm) {
            return { matches: flat, matchesByUtterance: byUtterance };
        }
        const pattern = new RegExp(escapeRegExp(searchTerm), caseSensitive ? 'g' : 'gi');
        for (const segment of transcript) {
            for (const u of segment.utterances) {
                pattern.lastIndex = 0;
                const utteranceMatches: Match[] = [];
                let m: RegExpExecArray | null;
                while ((m = pattern.exec(u.text)) !== null) {
                    const match: Match = {
                        utteranceId: u.id,
                        segmentId: segment.id,
                        globalIndex: flat.length,
                        start: m.index,
                        end: m.index + m[0].length,
                    };
                    utteranceMatches.push(match);
                    flat.push(match);
                    // Guard against zero-length matches (shouldn't happen with
                    // escaped literal patterns, but defensive).
                    if (m.index === pattern.lastIndex) pattern.lastIndex++;
                }
                if (utteranceMatches.length > 0) {
                    byUtterance.set(u.id, utteranceMatches);
                }
            }
        }
        return { matches: flat, matchesByUtterance: byUtterance };
    }, [transcript, isOpen, searchTerm, caseSensitive]);

    // External-store pattern: keep the latest matchesByUtterance + active
    // index in refs and notify only the subscribers whose data actually
    // changed. UtteranceC subscribes to its own utterance id, so unrelated
    // utterances skip the re-render cycle entirely.
    const matchesByUtteranceRef = useRef<MatchesByUtterance>(matchesByUtterance);
    const activeIndexRef = useRef<number>(currentMatchIndex);
    const subscribersRef = useRef<Map<string, Set<Subscriber>>>(new Map());

    // Diff the previous and current match maps and notify subscribers whose
    // utterance match-list identity changed. Done in an effect so we never
    // mutate refs or schedule callbacks during render.
    const prevMatchesByUtteranceRef = useRef<MatchesByUtterance>(new Map());
    useEffect(() => {
        const prev = prevMatchesByUtteranceRef.current;
        const next = matchesByUtterance;
        const changed = new Set<string>();
        for (const [id, list] of next) {
            if (prev.get(id) !== list) changed.add(id);
        }
        for (const id of prev.keys()) {
            if (!next.has(id)) changed.add(id);
        }
        matchesByUtteranceRef.current = next;
        prevMatchesByUtteranceRef.current = next;
        if (changed.size === 0) return;
        const subs = subscribersRef.current;
        for (const id of changed) {
            const set = subs.get(id);
            if (!set) continue;
            for (const cb of set) cb();
        }
    }, [matchesByUtterance]);

    // Clamp the active index when the matches list shrinks. Effect, not
    // conditional setState in render, so React doesn't re-enter.
    useEffect(() => {
        if (matches.length === 0 && currentMatchIndex !== 0) {
            setCurrentMatchIndex(0);
        } else if (currentMatchIndex >= matches.length && matches.length > 0) {
            setCurrentMatchIndex(0);
        }
    }, [matches, currentMatchIndex]);

    // When the active match moves, notify only the two utterances whose
    // active-highlight colour changes. Waking every utterance via a global
    // active-index subscriber would defeat the per-utterance subscription —
    // on each next/prev press all ~9K UtteranceC components would re-render.
    useEffect(() => {
        const oldActiveIndex = activeIndexRef.current;
        if (oldActiveIndex === currentMatchIndex) return;
        const oldActive = matches[oldActiveIndex];
        const newActive = matches[currentMatchIndex];
        activeIndexRef.current = currentMatchIndex;
        if (oldActive) {
            const set = subscribersRef.current.get(oldActive.utteranceId);
            if (set) for (const cb of set) cb();
        }
        if (newActive && newActive.utteranceId !== oldActive?.utteranceId) {
            const set = subscribersRef.current.get(newActive.utteranceId);
            if (set) for (const cb of set) cb();
        }
    }, [currentMatchIndex, matches]);

    const subscribe = useCallback((utteranceId: string, cb: Subscriber) => {
        let set = subscribersRef.current.get(utteranceId);
        if (!set) {
            set = new Set();
            subscribersRef.current.set(utteranceId, set);
        }
        set.add(cb);
        return () => {
            const s = subscribersRef.current.get(utteranceId);
            if (!s) return;
            s.delete(cb);
            if (s.size === 0) subscribersRef.current.delete(utteranceId);
        };
    }, []);

    const getMatches = useCallback((utteranceId: string) => {
        return matchesByUtteranceRef.current.get(utteranceId);
    }, []);
    const getActiveIndex = useCallback(() => activeIndexRef.current, []);

    const utteranceMatchesValue = useMemo(
        () => ({ subscribe, getMatches, getActiveIndex }),
        [subscribe, getMatches, getActiveIndex],
    );

    const open = useCallback(() => {
        setIsOpen(true);
        setPendingFocus('search');
    }, []);
    const openWithPrefill = useCallback((prefill: string | null) => {
        setIsOpen(true);
        if (prefill && prefill.trim()) {
            setSearchTermState(prefill);
            setCurrentMatchIndex(0);
            setPendingFocus('replace');
        } else {
            setPendingFocus('search');
        }
    }, []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen(v => !v), []);
    const clearPendingFocus = useCallback(() => setPendingFocus(null), []);

    const setSearchTerm = useCallback((s: string) => {
        setSearchTermState(s);
        setCurrentMatchIndex(0);
    }, []);

    const nextMatch = useCallback(() => {
        setCurrentMatchIndex(i => {
            if (matches.length === 0) return 0;
            return (i + 1) % matches.length;
        });
    }, [matches.length]);

    const prevMatch = useCallback(() => {
        setCurrentMatchIndex(i => {
            if (matches.length === 0) return 0;
            return (i - 1 + matches.length) % matches.length;
        });
    }, [matches.length]);

    const apiValue = useMemo<FindReplaceApi>(() => ({
        isOpen,
        searchTerm,
        replaceTerm,
        caseSensitive,
        currentMatchIndex,
        matches,
        pendingFocus,
        clearPendingFocus,
        open,
        openWithPrefill,
        close,
        toggle,
        setSearchTerm,
        setReplaceTerm,
        setCaseSensitive,
        nextMatch,
        prevMatch,
        setCurrentMatchIndex,
    }), [
        isOpen,
        searchTerm,
        replaceTerm,
        caseSensitive,
        currentMatchIndex,
        matches,
        pendingFocus,
        clearPendingFocus,
        open,
        openWithPrefill,
        close,
        toggle,
        setSearchTerm,
        nextMatch,
        prevMatch,
    ]);

    return (
        <FindReplaceContext.Provider value={apiValue}>
            <UtteranceMatchesContext.Provider value={utteranceMatchesValue}>
                {children}
            </UtteranceMatchesContext.Provider>
        </FindReplaceContext.Provider>
    );
}

export function useFindReplace(): FindReplaceApi {
    const ctx = useContext(FindReplaceContext);
    if (!ctx) throw new Error('useFindReplace must be used within a FindReplaceProvider');
    return ctx;
}

/**
 * Returns the matches for a specific utterance plus the active match's global
 * index. Subscribes via useSyncExternalStore so unrelated utterances do not
 * re-render when the search term changes — the active-index notification is
 * piggy-backed on the per-utterance subscriber, which the provider fires for
 * the old and new active utterances when the user navigates between matches.
 */
export function useUtteranceMatches(utteranceId: string): { matches: Match[]; activeIndex: number } {
    const ctx = useContext(UtteranceMatchesContext);
    const subscribe = useCallback((cb: () => void) => (ctx ? ctx.subscribe(utteranceId, cb) : () => { }), [ctx, utteranceId]);
    const matches = useSyncExternalStore(
        subscribe,
        useCallback(() => (ctx ? ctx.getMatches(utteranceId) ?? EMPTY_MATCHES : EMPTY_MATCHES), [ctx, utteranceId]),
        () => EMPTY_MATCHES,
    );
    const activeIndex = useSyncExternalStore(
        subscribe,
        useCallback(() => (ctx ? ctx.getActiveIndex() : -1), [ctx]),
        () => -1,
    );
    return { matches, activeIndex };
}
