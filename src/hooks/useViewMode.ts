"use client";
import { useCallback, useEffect, useState } from 'react';

export type ViewMode = 'default' | 'fisheye';

const PARAM = 'mode';

function readFromUrl(): ViewMode | null {
    if (typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search).get(PARAM);
    return p === 'fisheye' ? 'fisheye' : p === 'default' ? 'default' : null;
}

function writeToUrl(mode: ViewMode): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (mode === 'default') url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, mode);
    window.history.replaceState(null, '', url.toString());
}

/**
 * Reads/writes the transcript view mode. The URL is the canonical signal for
 * the active session, but we deliberately avoid next/navigation hooks here:
 * `useSearchParams` in a "use client" page without a Suspense boundary can
 * tear down React's render dispatcher during SSR error fallback and surface
 * as a cryptic `Cannot read properties of null (reading 'useContext')` at
 * Next.js's internal ErrorBoundary.
 *
 * Instead we read window.location on mount and write back with
 * `history.replaceState`, which keeps URL state in sync without router
 * coupling and is SSR-safe (initial state is always 'default', then hydrates
 * cleanly to whatever the URL says).
 */
export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
    const [mode, setModeState] = useState<ViewMode>('default');

    useEffect(() => {
        const fromUrl = readFromUrl();
        if (fromUrl !== null) setModeState(fromUrl);
    }, []);

    const setMode = useCallback((next: ViewMode) => {
        setModeState(next);
        writeToUrl(next);
    }, []);

    return [mode, setMode];
}
