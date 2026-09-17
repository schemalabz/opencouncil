'use client';

import { readStored, removeStored, writeStored } from '@/hooks/useStoredState';

/**
 * The half-filled signup, kept in this browser.
 *
 * A reader who already has an account signs out of nothing — they simply do
 * not know they have one, fill the whole form, and learn it at the last
 * press. The link that follows takes them out to their inbox and back in a
 * new tab, which is a new page load: without this, every location and topic
 * they picked is gone and most of them do not start again.
 *
 * Only what the reader typed or picked is kept, and only for a day. The
 * WhatsApp tick is deliberately NOT part of it: Notis owns that answer, and
 * a stale tick restored over his could resubscribe a reader who said ΣΤΟΠ.
 */

const PREFIX = 'oc:signup-draft:';
/** A day: long enough for an inbox round trip, short enough to be forgotten. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Bumped when a flow's stored shape changes, so an old draft is dropped rather than half-applied. */
const VERSION = 1;

interface StoredDraft<T> {
    version: number;
    at: number;
    value: T;
}

export const draftKey = (flow: string, cityId: string) => `${PREFIX}${flow}:${cityId}`;

export function writeDraft<T>(key: string, value: T): void {
    writeStored('local', key, JSON.stringify({ version: VERSION, at: Date.now(), value } satisfies StoredDraft<T>));
}

/** The stored draft, or null when there is none, it is stale, or it is unreadable. */
export function readDraft<T>(key: string): T | null {
    const raw = readStored('local', key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as StoredDraft<T>;
        if (parsed.version !== VERSION) return null;
        if (!Number.isFinite(parsed.at) || Date.now() - parsed.at > MAX_AGE_MS) return null;
        return parsed.value ?? null;
    } catch {
        return null;
    }
}

export function clearDraft(key: string): void {
    removeStored('local', key);
}
