'use client';

import { useEffect, useRef, useState } from 'react';
import { getNearbySubjects, type NearbySubjects } from '@/lib/actions/signupPlaces';
import type { Location } from '@/lib/types/onboarding';

export type NearbyState =
    | { status: 'loading' }
    | ({ status: 'ready' } & NearbySubjects)
    | { status: 'failed' };

/**
 * What the council discussed recently near a place. One request per place,
 * kept for the visit, so going back and forth between the steps does not ask
 * again. Null while there is no place.
 */
export function useNearbySubjects(cityId: string, place: Location | null): NearbyState | null {
    const cache = useRef(new Map<string, NearbySubjects>());
    const [state, setState] = useState<NearbyState | null>(null);
    const lng = place?.coordinates[0];
    const lat = place?.coordinates[1];

    useEffect(() => {
        if (lng === undefined || lat === undefined) {
            setState(null);
            return;
        }
        const key = `${lng},${lat}`;
        const kept = cache.current.get(key);
        if (kept) {
            setState({ status: 'ready', ...kept });
            return;
        }

        let cancelled = false;
        setState({ status: 'loading' });
        getNearbySubjects({ cityId, lng, lat })
            .then((nearby) => {
                cache.current.set(key, nearby);
                if (!cancelled) setState({ status: 'ready', ...nearby });
            })
            .catch((error: unknown) => {
                console.error('Nearby subjects failed:', error);
                if (!cancelled) setState({ status: 'failed' });
            });
        return () => {
            cancelled = true;
        };
    }, [cityId, lng, lat]);

    return state;
}
