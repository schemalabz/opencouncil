import { useEffect, useRef, useState } from 'react';
import {
    type LandingCity,
    type LandingMapCity,
    type MapSubject,
    type GeneralCityRow,
    type UpcomingMeeting,
} from '../landingData';
import { DATE_RANGES, type DateRangeKey, type MapFilters } from '../landingCore';

type Args = {
    /** subject data only loads once the subjects map is active (desktop subjects; mobile home) */
    subjectsActive: boolean;
    range: DateRangeKey;
    filters: MapFilters;
    /** a free-text query is active → fetch every subject (ignore the range dropdown) so the
     *  search spans all time, not just the selected window */
    searching: boolean;
};

export type LandingData = {
    cities: LandingCity[];
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

/**
 * Fetches everything the landing map renders. Cities, upcoming meetings, per-city totals and
 * the cooperating-municipality list load once on mount; the located + non-located subjects
 * load lazily once the subjects map is active, then refetch when the date range or
 * server-applied filters change (minDuration is client-side, so it's intentionally excluded).
 */
export function useLandingData({ subjectsActive, range, filters, searching }: Args): LandingData {
    const [mapSubjects, setMapSubjects] = useState<MapSubject[]>([]);
    const [generalRows, setGeneralRows] = useState<GeneralCityRow[]>([]);
    const [cities, setCities] = useState<LandingCity[]>([]);
    const [upcoming, setUpcoming] = useState<UpcomingMeeting[]>([]);
    const [subjectCountByCity, setSubjectCountByCity] = useState<Record<string, number>>({});
    const [mapCities, setMapCities] = useState<LandingMapCity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const get = <T,>(url: string): Promise<T[]> =>
            fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        Promise.all([
            get<LandingCity>('/api/cities'),
            get<UpcomingMeeting>('/api/meetings/upcoming'),
        ]).then(([allCities, upcomingMeetings]) => {
            if (cancelled) return;
            setCities(allCities);
            setUpcoming(upcomingMeetings);
        });
        // Total subjects per city (all released meetings) — the Δήμοι tab shows totals,
        // not the date-range/filter-narrowed count that drives the map.
        fetch('/api/map/subject-counts')
            .then((r) => (r.ok ? r.json() : {}))
            .catch(() => ({}))
            .then((counts: Record<string, number>) => {
                if (!cancelled) setSubjectCountByCity(counts);
            });
        // Cooperating municipalities with centroids → "Municipalities map" logo markers.
        get<LandingMapCity>('/api/map/cities').then((rows) => {
            if (!cancelled) setMapCities(rows);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Subjects load lazily: only once the user is on the subjects view, then refetch when the
    // date range or filters change. The key ref skips a redundant refetch when re-entering the
    // tab with the same params.
    const subjectsKeyRef = useRef<string | null>(null);
    useEffect(() => {
        if (!subjectsActive) return;
        let cancelled = false;
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
        const key = params.toString();
        if (subjectsKeyRef.current === key) return; // already loaded for these params
        subjectsKeyRef.current = key;
        setLoading(true);
        fetch(`/api/map/subjects?${params.toString()}`)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
            .then((subjects: MapSubject[]) => {
                if (cancelled) return;
                setMapSubjects(subjects);
                setLoading(false);
            });
        // Non-located subjects (same date/filter window) → city-hall markers.
        fetch(`/api/map/general-subjects?${params.toString()}`)
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
            .then((rows: GeneralCityRow[]) => {
                if (!cancelled) setGeneralRows(Array.isArray(rows) ? rows : []);
            });
        return () => {
            cancelled = true;
        };
        // minDuration is intentionally excluded — it's a client-side filter (see visibleSubjects),
        // so changing it must not trigger a refetch.
    }, [subjectsActive, searching, range, filters.cityIds, filters.bodyTypes, filters.dateFrom, filters.dateTo]);

    return { cities, upcoming, subjectCountByCity, mapCities, mapSubjects, generalRows, loading };
}
