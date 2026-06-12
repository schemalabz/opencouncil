import { useEffect, useRef } from 'react';
import type mapboxgl from 'mapbox-gl';
import { filterSubjectsInBounds, type ViewportBounds } from '@/lib/map/viewport';
import type { MapSubject } from '@/lib/map/types';

const VISIBLE_SUBJECTS_DEBOUNCE_MS = 250;

export function toViewportBounds(bounds: mapboxgl.LngLatBounds): ViewportBounds {
    return {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
    };
}

/**
 * Reports which subjects are inside the viewport (debounced on moveend and
 * recomputed when the subject set changes). Computed in JS over the loaded
 * subjects rather than queryRenderedFeatures, which misses clustered points.
 */
export function useVisibleSubjects(
    map: mapboxgl.Map | null,
    isLoaded: boolean,
    subjects: MapSubject[],
    onVisibleSubjectsChange: ((ids: string[]) => void) | undefined,
): void {
    const subjectsRef = useRef(subjects);
    subjectsRef.current = subjects;
    const callbackRef = useRef(onVisibleSubjectsChange);
    callbackRef.current = onVisibleSubjectsChange;
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!map || !isLoaded || !callbackRef.current) return;

        const compute = () => {
            const bounds = map.getBounds();
            if (!bounds) return;
            const visible = filterSubjectsInBounds(subjectsRef.current, toViewportBounds(bounds));
            callbackRef.current?.(visible.map(subject => subject.id));
        };

        const schedule = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(compute, VISIBLE_SUBJECTS_DEBOUNCE_MS);
        };

        compute();
        map.on('moveend', schedule);
        return () => {
            map.off('moveend', schedule);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [map, isLoaded]);

    // Recompute when the subject set itself changes (filter refetch)
    useEffect(() => {
        if (!map || !isLoaded || !callbackRef.current) return;
        const bounds = map.getBounds();
        if (!bounds) return;
        const visible = filterSubjectsInBounds(subjects, toViewportBounds(bounds));
        callbackRef.current(visible.map(subject => subject.id));
    }, [map, isLoaded, subjects]);
}
