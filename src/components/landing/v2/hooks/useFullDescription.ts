import { useEffect, useReducer, useState } from 'react';
import type { LandingSubject } from '@/lib/landing/landingData';

/** Full descriptions already fetched, by subject id — a subject reselected costs no second request. */
const fullDescriptions = new Map<string, string>();
/** Requests in flight, by subject id — two cards of one subject (a list card and the mobile
 *  expanded card) share one. */
const inFlight = new Map<string, Promise<string | null>>();

/** The full description of a subject, fetched once and kept. `null` when the route has none to give. */
function loadFullDescription(id: string): Promise<string | null> {
    const cached = fullDescriptions.get(id);
    if (cached !== undefined) return Promise.resolve(cached);
    let request = inFlight.get(id);
    if (!request) {
        request = fetch(`/api/subject/${id}/description`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { description?: unknown } | null) => {
                if (typeof data?.description !== 'string') return null;
                // Kept whether or not a card still waits for it: the next selection reads it here.
                fullDescriptions.set(id, data.description);
                return data.description;
            })
            .catch(() => null)
            .finally(() => inFlight.delete(id));
        inFlight.set(id, request);
    }
    return request;
}

/**
 * The description a card shows: the row's preview, or the full text once it is wanted and here.
 * The landing map ships every subject with a preview only (see previewDescription), so a card that
 * shows the description in full — the selected one — asks GET /api/subject/{id}/description for
 * the rest and keeps showing the preview until the answer lands. `loading` is true while that
 * request runs, so the card can say more is coming: the preview ends in "…" and would otherwise
 * read as complete. Only a truncated preview triggers a request; a request that fails leaves the
 * preview, which is the card's normal state anyway.
 */
export function useFullDescription(
    subject: Pick<LandingSubject, 'id' | 'descriptionPreview' | 'descriptionTruncated'>,
    wanted: boolean,
): { description: string; loading: boolean } {
    const [, arrived] = useReducer((n: number) => n + 1, 0);
    // The subject whose request ended with no text: its card stops saying more is coming. Cleared
    // when the request is let go, so a later selection that asks again shows the wait again.
    const [failedId, setFailedId] = useState<string | null>(null);
    const { id, descriptionPreview, descriptionTruncated } = subject;
    const fetchNeeded = wanted && descriptionTruncated && !fullDescriptions.has(id);

    useEffect(() => {
        if (!fetchNeeded) return;
        let cancelled = false;
        loadFullDescription(id).then((full) => {
            if (cancelled) return;
            if (full === null) setFailedId(id);
            else arrived();
        });
        return () => {
            cancelled = true;
            setFailedId(null);
        };
    }, [fetchNeeded, id]);

    return {
        description: (wanted && descriptionTruncated && fullDescriptions.get(id)) || descriptionPreview,
        loading: fetchNeeded && failedId !== id,
    };
}
