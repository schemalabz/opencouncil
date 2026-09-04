"use client";

import { useCallback, useEffect, useState } from 'react';

export type StorageArea = 'local' | 'session';

// Every access is guarded: storage is unavailable in a private window and
// wherever the user blocks site data, and a write can still hit the quota.
function readStored(kind: StorageArea, key: string): string | null {
    try {
        return (kind === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
    } catch {
        return null;
    }
}

function writeStored(kind: StorageArea, key: string, value: string): void {
    try {
        (kind === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value);
    } catch { /* the preference simply does not survive this navigation */ }
}

/**
 * A preference that survives navigations. The stored value arrives in a mount
 * effect, never during the first render: reading storage while rendering makes
 * the server HTML and the hydration render disagree for everyone whose stored
 * value is not the fallback.
 *
 * `parse` turns the stored string into the value, or returns undefined to
 * reject it — an unreadable or out-of-range entry leaves the fallback standing.
 * Pass a function defined outside the component, so the mount effect runs once.
 */
export function useStoredState<T extends string | number | boolean>(
    key: string,
    parse: (raw: string) => T | undefined,
    fallback: T,
    kind: StorageArea = 'local',
): [T, (value: T) => void] {
    const [value, setValue] = useState<T>(fallback);

    useEffect(() => {
        const raw = readStored(kind, key);
        if (raw === null) return;
        const parsed = parse(raw);
        if (parsed !== undefined) setValue(parsed);
    }, [key, parse, kind]);

    const store = useCallback((next: T) => {
        setValue(next);
        writeStored(kind, key, String(next));
    }, [key, kind]);

    return [value, store];
}
