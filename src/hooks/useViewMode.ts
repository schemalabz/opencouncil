"use client";
import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ViewMode = 'default' | 'fisheye';

const PARAM = 'mode';
const STORAGE_KEY = 'opencouncil.transcript.viewMode';

function parseMode(raw: string | null | undefined): ViewMode | null {
    return raw === 'fisheye' ? 'fisheye' : raw === 'default' ? 'default' : null;
}

function readFromUrl(): ViewMode | null {
    if (typeof window === 'undefined') return null;
    return parseMode(new URLSearchParams(window.location.search).get(PARAM));
}

function readFromStorage(): ViewMode | null {
    if (typeof window === 'undefined') return null;
    try {
        return parseMode(window.localStorage.getItem(STORAGE_KEY));
    } catch {
        return null;
    }
}

function writeToUrl(mode: ViewMode): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (mode === 'default') url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, mode);
    window.history.replaceState(null, '', url.toString());
}

function writeToStorage(mode: ViewMode): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // Storage may be unavailable (private mode, quota, disabled cookies).
    }
}

// Module-level store, shared across every useViewMode() consumer so the
// fisheye toggle and the transcript stay in sync (each useState would
// otherwise give every consumer its own private cell).
//
// HMR caveat: during dev hot-module replacement the old module instance can
// stay alive while the new one starts fresh, so `listeners` may briefly hold
// stale callbacks and `current` may diverge from what a freshly-mounted
// consumer sees. A full reload clears it. Production is unaffected — modules
// are evaluated once. No workaround here; if it gets noisy in dev, wire up
// `import.meta.hot` to clear `listeners` and reset `current`.
let current: ViewMode = 'default';
let hasInitializedFromStorage = false;
const listeners = new Set<() => void>();

function setCurrent(next: ViewMode): void {
    if (current === next) return;
    current = next;
    listeners.forEach(l => l());
}

function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

const getSnapshot = (): ViewMode => current;
const getServerSnapshot = (): ViewMode => 'default';

/**
 * Re-evaluated on every mount. An explicit URL ?mode= always wins (per-link
 * override) and is mirrored to storage; otherwise the very first init reads
 * storage so a previously-chosen preference carries into new sessions.
 * Subsequent mounts without a URL value leave the store alone — that way
 * navigating between transcripts keeps the user's last toggle decision
 * without storage ever clobbering it.
 */
function hydrate(): void {
    if (typeof window === 'undefined') return;
    const fromUrl = readFromUrl();
    if (fromUrl !== null) {
        writeToStorage(fromUrl);
        setCurrent(fromUrl);
        return;
    }
    if (!hasInitializedFromStorage) {
        hasInitializedFromStorage = true;
        const fromStorage = readFromStorage();
        if (fromStorage !== null) setCurrent(fromStorage);
    }
}

/**
 * Test-only: reset module state between tests. Keep it gated to NODE_ENV
 * !== 'production' so it isn't reachable from production bundles.
 */
export function __resetViewModeStoreForTests(): void {
    if (process.env.NODE_ENV === 'production') return;
    current = 'default';
    hasInitializedFromStorage = false;
    listeners.clear();
}

/**
 * Reads/writes the transcript view mode with localStorage as the persistent
 * source of truth and the URL as a per-link override. Backed by
 * useSyncExternalStore so every consumer in the tree re-renders when the
 * toggle is clicked, with no Provider plumbing.
 *
 * Deliberately avoids next/navigation hooks (useSearchParams/useRouter):
 * useSearchParams in a "use client" page without a Suspense boundary tore
 * down React's render dispatcher during SSR error fallback and surfaced as
 * `Cannot read properties of null (reading 'useContext')` from Next.js's
 * internal ErrorBoundary. Reading window.location on mount and writing back
 * with history.replaceState is SSR-safe.
 */
export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
    const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    useEffect(() => {
        hydrate();
    }, []);

    // Cross-tab sync: if storage changes in another tab, mirror it here. Skip
    // when the value matches what we already have to avoid a redundant render.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            // key === null means another tab called localStorage.clear(),
            // which clears every key including ours.
            if (e.key !== null && e.key !== STORAGE_KEY) return;
            // newValue === null means removeItem/clear — reset to default
            // so the tab matches the new empty-storage state.
            setCurrent(parseMode(e.newValue) ?? 'default');
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const setMode = useCallback((next: ViewMode) => {
        if (current === next) {
            // Still write — the URL may not yet have the param even though
            // the in-memory value matches (e.g. seeded from storage).
            writeToUrl(next);
            return;
        }
        writeToUrl(next);
        writeToStorage(next);
        setCurrent(next);
    }, []);

    return [mode, setMode];
}
