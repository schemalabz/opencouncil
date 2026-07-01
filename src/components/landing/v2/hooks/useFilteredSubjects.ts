import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
    toLandingSubjects,
    toGeneralCities,
    classifySearchQuery,
    filterSubjectsByQuery,
    subjectInViewport,
    subjectsWithinKm,
    type LandingCity,
    type LandingSubject,
    type LandingGeneralCity,
    type MapSubject,
    type GeneralCityRow,
    type MapViewport,
    type QueryKind,
} from '../landingData';
import { NEAREST_FALLBACK, type MapFilters } from '../landingCore';
import { rankLandingSubjects } from '../ranking';

// Non-located subjects appear in the list only while zoomed out below this level.
const NONLOCATED_MAX_ZOOM = 14;
// When the visitor searches an address, the list + pins narrow to subjects within this
// radius (km) of the geocoded point — "θέματα κοντά στη διεύθυνση".
const ADDRESS_RADIUS_KM = 2;

type Args = {
    /** raw located subjects from /api/map/subjects */
    mapSubjects: MapSubject[];
    /** raw non-located subjects, grouped per municipality */
    generalRows: GeneralCityRow[];
    /** all cities (for name / municipality-name lookups) */
    cities: LandingCity[];
    /** active category (topic) ids — empty means "all" */
    cats: string[];
    /** free-text search query */
    query: string;
    filters: MapFilters;
    /** geocoded searched-address point (narrows by radius), or null */
    addressPoint: { lat: number; lng: number } | null;
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
 * All the derived subject views the landing renders: the located subjects narrowed by
 * category / text / duration / address-radius, the non-located ones grouped per
 * municipality, the viewport-driven list, and the search-panel results. Pure derivations
 * (no effects), so this is a drop-in for the memos that used to live in LandingV2.
 */
export function useFilteredSubjects({
    mapSubjects,
    generalRows,
    cities,
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
        () =>
            toLandingSubjects(
                mapSubjects,
                Object.fromEntries(cities.map((c) => [c.id, c.name])),
                Object.fromEntries(cities.map((c) => [c.id, c.name_municipality])),
                Object.fromEntries(cities.map((c) => [c.id, c.logoImage])),
                generalLabel,
            ),
        [mapSubjects, cities, generalLabel],
    );

    // The free-text query is classified as a subject-title or address search; either
    // way it narrows the list/map (matching title or location text).
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

    // Non-located subjects per municipality (city-hall markers). The category/text/duration
    // filters narrow each city's list the same way they narrow the located subjects, so the
    // marker counts stay in sync; cities left with nothing drop their marker.
    const generalCities = useMemo(
        () =>
            toGeneralCities(
                generalRows,
                Object.fromEntries(cities.map((c) => [c.id, c.name])),
                Object.fromEntries(cities.map((c) => [c.id, c.name_municipality])),
                Object.fromEntries(cities.map((c) => [c.id, c.logoImage])),
                generalLabel,
            ),
        [generalRows, cities, generalLabel],
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
    // Importance-ranked (recency + discussion + small-municipality + όργανο + location
    // bonuses — see rankLandingSubjects), z-scored over the current visible set.
    const ordered = useMemo(() => rankLandingSubjects(visibleSubjects), [visibleSubjects]);

    // Non-located subjects can also be selected (from a city-hall box) into the list, so
    // selection lookups search the located subjects first, then the general ones.
    const allGeneralSubjects = useMemo(() => generalCities.flatMap((c) => c.subjects), [generalCities]);
    // Non-located subjects (filtered like the located ones) shown in the list when zoomed
    // out — importance-ranked the same way as the located ones (they land after them in the
    // list, so the location bonus surfaces as located-first).
    const visibleGeneralSubjects = useMemo(
        () => rankLandingSubjects(visibleGeneralCities.flatMap((c) => c.subjects)),
        [visibleGeneralCities],
    );
    const findSubject = (id: string): LandingSubject | null =>
        allSubjects.find((s) => s.id === id) ?? allGeneralSubjects.find((s) => s.id === id) ?? null;

    // The list shows ONLY the subjects whose pin is inside the current map view — the panel
    // mirrors what's on screen, so panning to an empty area empties the list. The single
    // exception is the selected subject, which is always kept in the list (even if the user
    // pans it out of view) so a selection never disappears under the user.
    const listSubjects = useMemo(() => {
        let list: LandingSubject[];
        if (addressPoint) {
            // Address search: show exactly the subjects near the geocoded point (already
            // radius-filtered in `ordered`); skip the viewport narrowing + non-located items.
            list = ordered;
        } else if (!mapView) {
            list = ordered;
        } else {
            list = ordered.filter((s) => subjectInViewport(s, mapView));
            // Non-located subjects have no pin — surface them while zoomed out, but only for
            // δήμοι whose centroid is in view, so the list stays viewport-bound.
            if (mapZoom < NONLOCATED_MAX_ZOOM && visibleGeneralSubjects.length) {
                list = [...list, ...visibleGeneralSubjects.filter((s) => subjectInViewport(s, mapView))];
            }
        }
        if (selectedId && !list.some((s) => s.id === selectedId)) {
            const sel = findSubject(selectedId);
            if (sel) list = [sel, ...list];
        }
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordered, mapView, mapZoom, visibleGeneralSubjects, selectedId, allSubjects, allGeneralSubjects, addressPoint]);

    // Free-text search results (title or address match), shown in the search panel
    // while the user is typing. Independent of the category filter / viewport.
    const searchResults = useMemo(
        () => (query.trim() ? filterSubjectsByQuery(allSubjects, query).slice(0, 20) : []),
        [allSubjects, query],
    );

    const selectedSubject = findSubject(selectedId ?? '');

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
