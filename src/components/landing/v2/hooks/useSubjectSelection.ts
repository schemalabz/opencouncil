import type { Dispatch, SetStateAction } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { SUBJECT_FOCUS_ZOOM, type FlyTarget } from '../landingCore';
import type { LandingCity, LandingSubject, MunicipalityInterest } from '../landingData';

type Args = {
    mapInstance: MapboxMap | null;
    isMobile: boolean;
    cities: LandingCity[];
    /** look up a subject (located or general) by id — from useFilteredSubjects */
    findSubject: (id: string) => LandingSubject | null;
    setSelectedId: (id: string | null) => void;
    setCats: Dispatch<SetStateAction<string[]>>;
    setFlyTo: (t: FlyTarget) => void;
    setInterested: (i: MunicipalityInterest) => void;
};

/**
 * Selection + category callbacks. Selecting a subject pans/zooms the map to it (never
 * zooms out; desktop offsets it right of the floating list) and marks its municipality as
 * "of interest". Toggling a category clears any selection (the filter may no longer match).
 */
export function useSubjectSelection({
    mapInstance,
    isMobile,
    cities,
    findSubject,
    setSelectedId,
    setCats,
    setFlyTo,
    setInterested,
}: Args) {
    const selectSubject = (id: string) => {
        setSelectedId(id);
        const s = findSubject(id);
        if (!s) return;
        // pan to the subject keeping the current zoom — clicking a pin should never zoom out.
        // Fall back to a fly-to only before the map instance is ready. The pan's moveend is
        // NOT suppressed, so the list refilters to the new (zoomed-in) viewport; the selected
        // subject is kept in the list regardless (see listSubjects + the layout's ensureIndex).
        if (mapInstance) {
            const c = mapInstance.getCenter();
            // zoom in to focus the subject when we're further out; never zoom out
            const targetZoom = Math.max(mapInstance.getZoom(), SUBJECT_FOCUS_ZOOM);
            const willMove =
                Math.abs(c.lng - s.lng) > 1e-6 ||
                Math.abs(c.lat - s.lat) > 1e-6 ||
                targetZoom - mapInstance.getZoom() > 1e-3;
            if (willMove) {
                mapInstance.easeTo({
                    center: [s.lng, s.lat],
                    zoom: targetZoom,
                    duration: 500,
                    // desktop: shift the subject right of center so it's clear of the
                    // left-hand floating list (one-time pan offset, doesn't persist).
                    offset: isMobile ? [0, 0] : [210, 0],
                });
            }
        } else {
            setFlyTo({ type: 'Point', coordinates: [s.lng, s.lat] });
        }
        // a clicked subject reveals interest in its municipality
        const city = cities.find((c) => c.id === s.cityId);
        if (city) setInterested({ kind: 'known', cityId: city.id, name: city.name, nameMunicipality: city.name_municipality });
    };

    const clearSelection = () => setSelectedId(null);

    // Toggle a category in/out of the active set. Applying a category filter drops any
    // selected subject (the previous selection may no longer match the new filter).
    const onToggleCat = (id: string) => {
        setCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
        setSelectedId(null);
    };
    const clearCats = () => setCats([]);

    return { selectSubject, clearSelection, onToggleCat, clearCats };
}
