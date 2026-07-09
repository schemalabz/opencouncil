import { useEffect, useRef, useState } from 'react';
import {
    type LandingListCity,
    type LandingMapCity,
    type MapSubject,
    type GeneralCityRow,
    type UpcomingMeeting,
} from '@/lib/landing/landingData';
import { DATE_RANGES, type DateRangeKey, type MapFilters } from '@/lib/landing/landingCore';

/** The server-loaded initial data (page.tsx → LandingV2), seeded into state / passed through. */
export type LandingInitialData = {
    cities: LandingListCity[];
    upcoming: UpcomingMeeting[];
    subjectCountByCity: Record<string, number>;
    mapCities: LandingMapCity[];
    /** located subjects for the default range (DEFAULT_RANGE) — first paint, no client fetch */
    subjects: MapSubject[];
    /** non-located subjects for the default range */
    generalRows: GeneralCityRow[];
};

type Args = {
    /** subject data only loads once the subjects map is active (desktop subjects; mobile home) */
    subjectsActive: boolean;
    range: DateRangeKey;
    filters: MapFilters;
    /** a free-text query is active → fetch every subject (ignore the range dropdown) so the
     *  search spans all time, not just the selected window */
    searching: boolean;
    /** server-loaded initial data — seeds the state so the map renders before any client fetch */
    initial: LandingInitialData;
};

export type LandingData = {
    cities: LandingListCity[];
    upcoming: UpcomingMeeting[];
    /** unfiltered total subjects per city (Δήμοι tab) */
    subjectCountByCity: Record<string, number>;
    /** cooperating municipalities with centroids + boundary geometry */
    mapCities: LandingMapCity[];
    /** located subjects for the current range/filters */
    mapSubjects: MapSubject[];
    /** non-located subjects grouped per municipality */
    generalRows: GeneralCityRow[];
    loading: boolean;
};

/** Query string for the subjects/general-subjects endpoints. Shared by the fetch effect and
 *  the seed guard so the server-loaded first page isn't re-fetched on mount. */
function buildSubjectParams(range: DateRangeKey, filters: MapFilters, searching: boolean): string {
    const params = new URLSearchParams();
    if (searching) {
        // A free-text search spans every subject, regardless of the range dropdown / date pane.
        params.set('allTime', 'true');
    } else if (filters.dateFrom || filters.dateTo) {
        // Explicit date range from the filter pane overrides the quick-range pill.
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
    } else {
        const { query } = DATE_RANGES.find((r) => r.key === range) ?? DATE_RANGES[0];
        const [key, value] = query.split('=');
        params.set(key, value);
    }
    if (filters.cityIds.length) params.set('cityIds', filters.cityIds.join(','));
    if (filters.bodyTypes.length) params.set('bodyType', filters.bodyTypes.join(','));
    return params.toString();
}

/** GET a JSON list, tolerating a failed request or a non-array body (→ empty list). */
async function fetchList<T>(url: string): Promise<T[]> {
    try {
        const r = await fetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

// Endpoint builders (module-level → stable identity, safe as effect deps below).
const subjectsUrl = (key: string) => `/api/map/subjects?${key}`;
const generalUrl = (key: string) => `/api/map/general-subjects?${key}`;

/**
 * A keyed list fetch: seeded with server data for the mount key, it refetches whenever `key`
 * changes (and `enabled` is true), skipping keys already loaded. `loading` is *derived* — it's
 * simply "the key we want ≠ the key we have" — so there's no separate loading flag to keep in
 * sync, a cancelled request can't get stuck, and stale results can't win.
 */
function useKeyedList<T>(
    key: string,
    initial: T[],
    buildUrl: (key: string) => string,
    enabled: boolean,
): { data: T[]; loading: boolean } {
    const [data, setData] = useState<T[]>(initial);
    // The key whose result is currently in `data` (seeded with the mount key → no initial fetch).
    const [loadedKey, setLoadedKey] = useState(key);
    const loadedKeyRef = useRef(loadedKey);
    loadedKeyRef.current = loadedKey;

    useEffect(() => {
        if (!enabled || key === loadedKeyRef.current) return;
        let cancelled = false;
        fetchList<T>(buildUrl(key)).then((rows) => {
            if (cancelled) return;
            setData(rows);
            setLoadedKey(key); // only a resolved, non-cancelled fetch advances the loaded key
        });
        return () => {
            cancelled = true;
        };
    }, [key, enabled, buildUrl]);

    return { data, loading: enabled && key !== loadedKey };
}

/**
 * The located + non-located subjects the landing map renders for the current range/filters.
 * Cities, upcoming meetings, per-city totals and the municipality list come from the server
 * (page.tsx props) and pass straight through. Subjects are seeded from the server's default
 * range and refetch only when the range or server-applied filters change (minDuration is
 * client-side, so buildSubjectParams excludes it and the key doesn't change).
 */
export function useLandingData({ subjectsActive, range, filters, searching, initial }: Args): LandingData {
    const key = buildSubjectParams(range, filters, searching);
    // Located subjects (map pins) drive the map's loading pill; the general list refreshes silently.
    const { data: mapSubjects, loading } = useKeyedList<MapSubject>(key, initial.subjects, subjectsUrl, subjectsActive);
    const { data: generalRows } = useKeyedList<GeneralCityRow>(key, initial.generalRows, generalUrl, subjectsActive);

    return {
        cities: initial.cities,
        upcoming: initial.upcoming,
        subjectCountByCity: initial.subjectCountByCity,
        mapCities: initial.mapCities,
        mapSubjects,
        generalRows,
        loading,
    };
}
