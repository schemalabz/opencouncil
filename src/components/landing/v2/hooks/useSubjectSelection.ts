import type { Dispatch, SetStateAction } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { SUBJECT_FOCUS_ZOOM, type FlyTarget } from '@/lib/landing/landingCore';
import type { LandingListCity, LandingSubject, MunicipalityInterest } from '@/lib/landing/landingData';

type Args = {
    mapInstance: MapboxMap | null;
    isMobile: boolean;
    cities: LandingListCity[];
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
        // Pan to the subject, keeping zoom — clicking a pin should never zoom out. The moveend
        // is NOT suppressed, so the list refilters; the selection is kept regardless (see
        // listSubjects + ensureIndex). Fall back to a fly-to before the map instance is ready.
        if (mapInstance) {
            const c = mapInstance.getCenter();
            // zoom in to focus the subject when further out; never zoom out
            const targetZoom = Math.max(mapInstance.getZoom(), SUBJECT_FOCUS_ZOOM);
            const willMove =
                Math.abs(c.lng - s.lng) > 1e-6 ||
                Math.abs(c.lat - s.lat) > 1e-6 ||
                targetZoom - mapInstance.getZoom() > 1e-3;
            // mobile (select mode): lift the subject into the top of the viewport so its location is
            // visible above the expanded card. Always ease on mobile — a preview may have already
            // centred it, but the top-offset still needs applying. Desktop keeps the willMove guard.
            const mobileTopOffset = -Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.24);
            if (isMobile) {
                mapInstance.easeTo({ center: [s.lng, s.lat], zoom: targetZoom, duration: 500, offset: [0, mobileTopOffset] });
            } else if (willMove) {
                mapInstance.easeTo({ center: [s.lng, s.lat], zoom: targetZoom, duration: 500, offset: [210, 0] });
            }
        } else {
            setFlyTo({ type: 'Point', coordinates: [s.lng, s.lat] });
        }
        // a clicked subject reveals interest in its municipality
        const city = cities.find((c) => c.id === s.cityId);
        if (city) setInterested({ kind: 'known', cityId: city.id, name: city.name, nameMunicipality: city.name_municipality });
    };

    const clearSelection = () => setSelectedId(null);

    // Toggle a category in/out of the active set; drops any selection (may no longer match).
    const onToggleCat = (id: string) => {
        setCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
        setSelectedId(null);
    };
    const clearCats = () => setCats([]);

    return { selectSubject, clearSelection, onToggleCat, clearCats };
}
