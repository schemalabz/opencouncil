"use client";

import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the URL waits behind the box, matching the list search in `List.tsx`. */
const WRITE_DELAY_MS = 300;

/**
 * A text filter whose record is the URL, so the browser's Back button brings
 * the reader back to the list they left rather than to a default one.
 *
 * `initial` is what the server rendered for the same parameter. From the first
 * effect onward the URL is the only truth, so a page that renders this must
 * seed `initial` from the same parameter.
 *
 * The write is debounced. A browser limits how often a page may call
 * `history.replaceState` — WebKit throws past about 100 calls in 30 seconds —
 * and one call per keystroke reaches that limit. The third return value writes
 * the pending value at once: call it before you navigate away, or the last
 * keystrokes never reach the URL.
 */
export function useQueryParamState(param: string, initial: string): [string, (next: string) => void, () => void] {
    const [value, setValue] = useState(initial);
    const pending = useRef<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // After mount, never during the render: the server rendered `initial`, and
    // reading `location` while rendering would make the hydration render
    // disagree with the HTML.
    useEffect(() => {
        setValue(new URLSearchParams(window.location.search).get(param) ?? '');
    }, [param]);

    const flush = useCallback(() => {
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        const next = pending.current;
        if (next === null) return;
        pending.current = null;

        const url = new URL(window.location.href);
        // The URL carries the trimmed search, because that is what the filter
        // reads; the box keeps whatever the reader typed.
        const trimmed = next.trim();
        if (trimmed) url.searchParams.set(param, trimmed);
        else url.searchParams.delete(param);
        try {
            // `null`, not the current history state: Next's patched
            // `replaceState` copies its own routing state forward, and skips
            // the router sync entirely when the state it is handed already
            // carries that routing state.
            window.history.replaceState(null, '', url);
        } catch {
            // A browser that is rate-limiting history calls keeps the old URL.
            // The list still filters; only Back stops restoring it.
        }
    }, [param]);

    const set = useCallback(
        (next: string) => {
            setValue(next);
            pending.current = next;
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = setTimeout(flush, WRITE_DELAY_MS);
        },
        [flush],
    );

    // Drop a pending write on unmount rather than running it: by then the
    // reader is on the next page, and the write would edit that page's URL.
    useEffect(
        () => () => {
            if (timer.current !== null) clearTimeout(timer.current);
        },
        [],
    );

    return [value, set, flush];
}
