import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
    toLandingSubjects,
    toGeneralCities,
    classifySearchQuery,
    filterSubjectsByQuery,
    subjectInViewport,
    subjectsWithinKm,
    type LandingSubject,
    type LandingGeneralCity,
    type MapSubject,
    type GeneralCityRow,
    type MapViewport,
    type QueryKind,
} from '@/lib/landing/landingData';
import { type MapFilters } from '@/lib/landing/landingCore';
import { rankAndSortSubjects, type RankableSubject } from '@/lib/ranking/subjects';
import type { LatLng } from '@/lib/google-maps';

// Adapt a landing subject into the shared ranker's input. `durationMin` feeds the log-damped
// discussion signal; a non-empty `where` means the subject is located.
const toRankable = (s: LandingSubject): RankableSubject => ({
    cityId: s.cityId,
    meetingDate: s.date,
    discussionSignal: s.durationMin,
    adminBodyType: s.adminBodyType,
    hasLocation: !!s.where.trim(),
});

const RANKING_DEBUG = process.env.NODE_ENV === 'development';

// Rank best-first; in dev, attach each subject's score + breakdown for SubjectCard's debug overlay.
const rankVisible = (subjects: LandingSubject[]): LandingSubject[] =>
    rankAndSortSubjects(subjects, toRankable).map((r) =>
        RANKING_DEBUG ? { ...r.item, _debugRanking: { score: r.score, components: r.components } } : r.item,
    );

// Non-located subjects appear in the list only while zoomed out below this level.
const NONLOCATED_MAX_ZOOM = 14;
// Address search narrows the list + pins to subjects within this radius (km) of the geocoded point.
const ADDRESS_RADIUS_KM = 2;

type Args = {
    /** raw located subjects from /api/map/subjects */
    mapSubjects: MapSubject[];
    /** raw non-located subjects, grouped per municipality */
    generalRows: GeneralCityRow[];
    /** active category (topic) ids — empty means "all" */
    cats: string[];
    /** free-text search query */
    query: string;
    filters: MapFilters;
    /** geocoded searched-address point (narrows by radius), or null */
    addressPoint: LatLng | null;
    /** current map viewport (drives the in-view list) */
    mapView: MapViewport | null;
    mapZoom: number;
    selectedId: string | null;
};

export type FilteredSubjects = {
    allSubjects: LandingSubject[];
    queryKind: QueryKind;
    visibleSubjects: LandingSubject[];
    generalCities: LandingGeneralCity[];
    visibleGeneralCities: LandingGeneralCity[];
    ordered: LandingSubject[];
    allGeneralSubjects: LandingSubject[];
    visibleGeneralSubjects: LandingSubject[];
    listSubjects: LandingSubject[];
    searchResults: LandingSubject[];
    findSubject: (id: string) => LandingSubject | null;
    selectedSubject: LandingSubject | null;
};

/**
 * All the derived subject views the landing renders: located subjects narrowed by
 * category / text / duration / address-radius, non-located ones grouped per municipality,
 * the viewport-driven list, and the search-panel results. Pure derivations, no effects.
 */
export function useFilteredSubjects({
    mapSubjects,
    generalRows,
    cats,
    query,
    filters,
    addressPoint,
    mapView,
    mapZoom,
    selectedId,
}: Args): FilteredSubjects {
    const t = useTranslations('landingV2');
    const generalLabel = t('topic.general');
    const allSubjects = useMemo(
        // rows are authoritative for name/genitive/logo — no city-list reconciliation needed
        () => toLandingSubjects(mapSubjects, generalLabel),
        [mapSubjects, generalLabel],
    );

    // Classify the free-text query as a subject-title or address search.
    const queryKind = useMemo<QueryKind>(() => classifySearchQuery(query, allSubjects), [query, allSubjects]);
    const visibleSubjects = useMemo(() => {
        const byCat =
            cats.length === 0 ? allSubjects : allSubjects.filter((s) => s.topicId != null && cats.includes(s.topicId));
        // An address query locates the map; it shouldn't narrow the subjects by text.
        const byQuery = queryKind === 'address' ? byCat : filterSubjectsByQuery(byCat, query);
        // Discussion-time filter is client-side (duration is computed per subject after fetch).
        const byDuration =
            filters.minDuration != null ? byQuery.filter((s) => s.durationMin >= filters.minDuration!) : byQuery;
        // A geocoded address narrows the list + pins to subjects within ADDRESS_RADIUS_KM.
        return addressPoint
            ? subjectsWithinKm(byDuration, addressPoint.lat, addressPoint.lng, ADDRESS_RADIUS_KM)
            : byDuration;
    }, [allSubjects, cats, query, queryKind, filters.minDuration, addressPoint]);

    // Non-located subjects per municipality (city-hall markers).
    const generalCities = useMemo(
        // rows are authoritative for name/genitive/logo — no city-list reconciliation needed
        () => toGeneralCities(generalRows, generalLabel),
        [generalRows, generalLabel],
    );
    const visibleGeneralCities = useMemo<LandingGeneralCity[]>(() => {
        return generalCities
            .map((city) => {
                const byCat =
                    cats.length === 0
                        ? city.subjects
                        : city.subjects.filter((s) => s.topicId != null && cats.includes(s.topicId));
                const byQuery = queryKind === 'address' ? byCat : filterSubjectsByQuery(byCat, query);
                const subjects =
                    filters.minDuration != null
                        ? byQuery.filter((s) => s.durationMin >= filters.minDuration!)
                        : byQuery;
                return { ...city, subjects };
            })
            .filter((city) => city.subjects.length > 0);
    }, [generalCities, cats, query, queryKind, filters.minDuration]);
    // Importance-ranked over the current visible set (see @/lib/ranking/subjects).
    const ordered = useMemo(() => rankVisible(visibleSubjects), [visibleSubjects]);

    // Flattened general subjects — selection lookups fall back here after the located ones.
    const allGeneralSubjects = useMemo(() => generalCities.flatMap((c) => c.subjects), [generalCities]);
    const visibleGeneralSubjects = useMemo(
        () => visibleGeneralCities.flatMap((c) => c.subjects),
        [visibleGeneralCities],
    );
    // Located + non-located ranked as ONE set, so a hot municipality-wide subject can outrank
    // weak located ones. The ranker's z-scores adapt to the merged distribution, and its
    // `location` weight is the deliberate located-over-unlocated tiebreaker.
    const orderedMerged = useMemo(
        () => rankVisible([...visibleSubjects, ...visibleGeneralSubjects]),
        [visibleSubjects, visibleGeneralSubjects],
    );
    const findSubject = (id: string): LandingSubject | null =>
        allSubjects.find((s) => s.id === id) ?? allGeneralSubjects.find((s) => s.id === id) ?? null;

    // The list shows ONLY subjects whose pin is inside the current map view, so panning to an
    // empty area empties it. Non-located subjects (anchored at their city centroid, empty
    // `where`) join in rank order while zoomed out below NONLOCATED_MAX_ZOOM — zoomed in, a
    // municipality-wide subject isn't "in this view". Exception: the selected subject is
    // always kept in the list.
    const listSubjects = useMemo(() => {
        let list: LandingSubject[];
        if (addressPoint) {
            // Address search: `ordered` is already radius-filtered; located-only by design
            // (a city-wide subject isn't "near this address").
            list = ordered;
        } else {
            const includeNonLocated = mapZoom < NONLOCATED_MAX_ZOOM;
            list = orderedMerged.filter((s) => {
                if (!s.where.trim() && !includeNonLocated) return false;
                return !mapView || subjectInViewport(s, mapView);
            });
        }
        if (selectedId && !list.some((s) => s.id === selectedId)) {
            const sel = findSubject(selectedId);
            if (sel) list = [sel, ...list];
        }
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordered, orderedMerged, mapView, mapZoom, selectedId, allSubjects, allGeneralSubjects, addressPoint]);

    // Free-text search-panel results, independent of the category filter / viewport. Searches
    // located AND municipality-wide subjects (the latter would otherwise be invisible to search).
    const searchResults = useMemo(
        () =>
            query.trim()
                ? filterSubjectsByQuery([...allSubjects, ...allGeneralSubjects], query).slice(0, 20)
                : [],
        [allSubjects, allGeneralSubjects, query],
    );

    const selectedSubject = useMemo(
        () => findSubject(selectedId ?? ''),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [selectedId, allSubjects, allGeneralSubjects],
    );

    return {
        allSubjects,
        queryKind,
        visibleSubjects,
        generalCities,
        visibleGeneralCities,
        ordered,
        allGeneralSubjects,
        visibleGeneralSubjects,
        listSubjects,
        searchResults,
        findSubject,
        selectedSubject,
    };
}
