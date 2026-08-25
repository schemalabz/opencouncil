export const DRAFT_STORAGE_KEY = 'product-update-draft';

export interface ProductUpdateDraft {
    subject: string;
    body: string;
    tags: string[];
}

/**
 * Read the saved compose draft. Returns null when nothing is stored or the
 * stored value is not a well-formed draft, so a corrupt entry never throws.
 */
export function loadDraft(): ProductUpdateDraft | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return null;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const candidate = parsed as Record<string, unknown>;
        if (typeof candidate.subject !== 'string') return null;
        if (typeof candidate.body !== 'string') return null;
        if (!Array.isArray(candidate.tags)) return null;
        return {
            subject: candidate.subject,
            body: candidate.body,
            tags: candidate.tags.filter((tag): tag is string => typeof tag === 'string'),
        };
    } catch {
        return null;
    }
}

/** Persist the compose draft. Storage failures (quota, disabled) are ignored. */
export function saveDraft(draft: ProductUpdateDraft): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
        // storage unavailable or full — a failed autosave must not break editing
    }
}

/** Remove the saved compose draft. */
export function clearDraft(): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
        // ignore
    }
}
