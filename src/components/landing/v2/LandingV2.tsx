'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Map as MapboxMap } from 'mapbox-gl';
import { useSession } from 'next-auth/react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useTopics } from '@/hooks/useTopics';
import Map from '@/components/map/map';
import { useMapFeatures } from './hooks/useMapFeatures';
import { useMapActions } from './hooks/useMapActions';
import { useFilteredSubjects } from './hooks/useFilteredSubjects';
import { useLandingData } from './hooks/useLandingData';
import { useNotifyPrompt } from './hooks/useNotifyPrompt';
import { useSubjectSelection } from './hooks/useSubjectSelection';
import {
    useGeneralCityMarkers,
    useMapViewCapture,
    useMunicipalityMarkers,
    useSubjectMarkers,
} from './hooks/useMapMarkers';
import { useMapPopups } from './hooks/useMapPopups';
import {
    detectMunicipalityQuery,
    type CenterMunicipality,
    type ClickedMunicipality,
    type CoLocatedBox,
    type GeneralBox,
    type LandingGeneralCity,
    type LandingSubject,
    type MapViewport,
    type MunicipalityInterest,
} from './landingData';
import {
    DEFAULT_VIEW,
    DEFAULT_RANGE,
    EMPTY_FILTERS,
    clusterCellDegrees,
    desktopView,
    flyToMunicipality,
    parseInitialUrlState,
    type DateRangeKey,
    type LandingView,
    type LayoutProps,
    type MapFilters,
} from './landingCore';
import { useRouter } from '@/i18n/routing';
import { NotifyPrompt } from './NotifyPrompt';
import { DesktopLayout } from './DesktopLayout';
import { MobileLayout } from './MobileLayout';

/**
 * The consolidated landing redesign (issue #208). Desktop (≥ lg): the split-screen
 * map + side panel direction, with the search field and topic filters floating
 * over the map and a Θέματα / Δήμοι tabbed panel. Mobile: the immersive map-first
 * layout with a draggable trending sheet. Only one <Map> is mounted at a time.
 *
 * Data comes from the real APIs: /api/map/subjects (geo-located subjects),
 * /api/topics, /api/cities and /api/meetings/upcoming — see ./landingData.ts.
 */
export function LandingV2() {
    // Selected category (topic) ids — empty means "all". Multiple may be active at once.
    const [cats, setCats] = useState<string[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // View mode — drives both the aside nav/body and the map's marker layer.
    // 'home'/'subjects' show subject pins; 'municipalities' shows one logo marker per
    // cooperating δήμος. Desktop has no 'home' for iteration 1, so it defaults to
    // 'subjects'; mobile keeps its 'home' tab (restored on mount in the URL-init effect).
    const [view, setView] = useState<LandingView>('subjects');
    // Mobile: the OpenCouncil badge shows a card preview (like a subject), not a tooltip.
    const [explainOpen, setExplainOpen] = useState(false);
    // Current map view (captured on moveend) — drives the in-view list and clustering.
    const [mapView, setMapView] = useState<MapViewport | null>(null);
    // Current zoom — non-located subjects show in the list only while zoomed out (< this).
    const [mapZoom, setMapZoom] = useState(DEFAULT_VIEW.zoom);
    // The geographic cluster-cell size for the current zoom. Markers only re-cluster when
    // this value actually changes (i.e. when crossing a zoom level that changes the cell) —
    // not on every tiny pan/zoom, which would otherwise rebuild and visibly flip the donuts.
    const [clusterCell, setClusterCell] = useState(() => clusterCellDegrees(DEFAULT_VIEW.zoom));
    // Open "co-located subjects" box: the subjects at one point + its screen position.
    const [coLocated, setCoLocated] = useState<CoLocatedBox | null>(null);
    // Open "general subjects" box: a municipality's non-located subjects + screen position.
    const [generalBox, setGeneralBox] = useState<GeneralBox | null>(null);

    // The municipality the visitor seems interested in (from a filter, a clicked
    // subject, or a "δήμος X" search) → drives the delayed notification prompt.
    const { status: sessionStatus } = useSession();
    const [interested, setInterested] = useState<MunicipalityInterest | null>(null);

    // Default to the desktop layout during SSR (matches=false until mounted), so
    // the common desktop view has no layout flash; mobile flips in after hydration.
    const isMobile = useMediaQuery('(max-width: 1023px)');

    // Desktop has no 'home' tab — mobile does. When the viewport crosses the breakpoint, remap
    // the shared view so the target layout lands on the equivalent tab: the map-first view is
    // 'subjects' on desktop and 'home' on mobile (municipalities maps 1:1). The first run (mount)
    // is skipped — parseInitialUrlState already picks the right per-device view.
    const layoutSyncedRef = useRef(false);
    useEffect(() => {
        if (!layoutSyncedRef.current) {
            layoutSyncedRef.current = true;
            return;
        }
        setView((v) => (isMobile ? (v === 'subjects' ? 'home' : v) : v === 'home' ? 'subjects' : v));
    }, [isMobile]);

    // When subject data/pins are "active" — drives the lazy fetch + the map's subject layer.
    // Both the subjects view and the map-first 'home' show subject pins (on desktop 'home' is
    // the 'subjects' experience), so subject data loads for either; municipalities doesn't.
    const subjectsActive = view === 'subjects' || view === 'home';

    // The Mapbox instance — subject pins are HTML markers added onto it (so they can
    // carry the topic's lucide icon) and the zoom buttons drive it directly.
    const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
    const handleMapReady = useCallback((m: MapboxMap) => setMapInstance(m), []);

    // Map camera actions (locate, geocode-address, zoom, basemap toggle, OpenCouncil fly-to)
    // and the state they own (geo dot, address point, fly-to target, basemap + camera).
    const {
        geo,
        addressPoint,
        setAddressPoint,
        flyTo,
        setFlyTo,
        mapStyle,
        satellite,
        cameraRef,
        toggleMapStyle,
        locate,
        locateAddress,
        zoomIn,
        zoomOut,
        showExplainLocation,
    } = useMapActions({ mapInstance, isMobile });
    // Set before a selection-triggered pan so the next moveend doesn't refilter the list.
    const suppressViewCaptureRef = useRef(false);
    // A co-located "+N" pan centers the point first, then opens the box on the next moveend.
    const pendingCoLocatedRef = useRef<LandingSubject[] | null>(null);
    // A city-hall pan centers the centroid first, then opens the general box on the next moveend.
    const pendingGeneralRef = useRef<LandingGeneralCity | null>(null);

    // ---- real data ----
    const { topics } = useTopics();
    // Boundary geometry per city, fetched lazily when a municipality filter is applied, so
    // the map can shade the selected δήμος with a blue-gray overlay (cached by id).
    const [cityGeometries, setCityGeometries] = useState<Record<string, GeoJSON.Geometry>>({});
    // An out-of-network municipality the user clicked on the map — shaded orange.
    const [clickedMunicipality, setClickedMunicipality] = useState<ClickedMunicipality | null>(null);
    // The municipality under the map center (updated on every move) — drives the "view its
    // page" button so it's available whenever the map is over a δήμος. officialSupport
    // gates the button: it's only shown for δήμοι that are actually in OpenCouncil.
    const [centerMunicipality, setCenterMunicipality] = useState<CenterMunicipality | null>(null);

    const [range, setRange] = useState<DateRangeKey>(DEFAULT_RANGE);
    const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);
    const [query, setQuery] = useState('');
    // A free-text search ignores the range dropdown so it spans every subject (see useLandingData).
    const searching = query.trim().length > 0;
    // Cities, upcoming meetings, per-city totals, cooperating municipalities, and the
    // range/filter-scoped located + non-located subjects. See useLandingData.
    const { cities, upcoming, subjectCountByCity, mapCities, mapSubjects, generalRows, loading } = useLandingData({
        subjectsActive,
        range,
        filters,
        searching,
    });

    // ---- URL state sync ----
    // A subject id restored from the URL, pending a map fly-to once the data + map are ready.
    const restoreSubjectRef = useRef<string | null>(null);
    // Restore the selected subject + filters from the URL on first mount (client-only, so it
    // doesn't run during SSR and cause a hydration mismatch).
    useEffect(() => {
        const init = parseInitialUrlState(window.location.search, window.matchMedia('(max-width: 1023px)').matches);
        setSelectedId(init.selectedId);
        // a deep-linked subject pans/zooms in once the data + map are ready (see below)
        if (init.selectedId) restoreSubjectRef.current = init.selectedId;
        setView(init.view);
        setCats(init.cats);
        setQuery(init.query);
        setRange(init.range);
        setFilters(init.filters);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reflect the current selection + filters in the URL (no navigation, so it's shareable
    // and survives a reload). The first run (mount) is skipped — the URL is the source then.
    const urlWroteOnceRef = useRef(false);
    useEffect(() => {
        if (!urlWroteOnceRef.current) {
            urlWroteOnceRef.current = true;
            return;
        }
        const p = new URLSearchParams();
        if (view !== 'home') p.set('view', view);
        if (selectedId) p.set('subject', selectedId);
        if (cats.length) p.set('cat', cats.join(','));
        if (query.trim()) p.set('q', query.trim());
        if (range !== DEFAULT_RANGE) p.set('range', range);
        if (filters.cityIds.length) p.set('city', filters.cityIds[0]);
        if (filters.bodyTypes.length) p.set('body', filters.bodyTypes.join(','));
        if (filters.dateFrom) p.set('from', filters.dateFrom);
        if (filters.dateTo) p.set('to', filters.dateTo);
        if (filters.minDuration != null) p.set('dur', String(filters.minDuration));
        const qs = p.toString();
        window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, [view, selectedId, cats, query, range, filters]);

    // All derived subject views (located + non-located, narrowed by category/text/duration/
    // address-radius, the viewport list, search results). See useFilteredSubjects.
    const {
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
    } = useFilteredSubjects({
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
    });

    const { selectSubject, clearSelection, onToggleCat, clearCats } = useSubjectSelection({
        mapInstance,
        isMobile,
        cities,
        findSubject,
        setSelectedId,
        setCats,
        setFlyTo,
        setInterested,
    });

    // Interest also follows the municipality filter (last selected) and "δήμος X" searches.
    useEffect(() => {
        if (!filters.cityIds.length) return;
        const id = filters.cityIds[filters.cityIds.length - 1];
        const city = cities.find((c) => c.id === id);
        if (city) setInterested({ kind: 'known', cityId: city.id, name: city.name, nameMunicipality: city.name_municipality });
    }, [filters.cityIds, cities]);
    useEffect(() => {
        const match = detectMunicipalityQuery(query, cities);
        if (match) setInterested(match);
    }, [query, cities]);
    // Clearing the search removes the searched-address marker.
    useEffect(() => {
        if (!query.trim()) setAddressPoint(null);
    }, [query]);

    // The municipality currently chosen in the filters (single-select) — drives the
    // blue-gray boundary overlay on the map.
    const filterCityId = filters.cityIds[filters.cityIds.length - 1] ?? null;
    // The "view its page" button links to whichever municipality the map is currently
    // centered over, so it tracks the map as the user pans/zooms — but only for δήμοι
    // that are in OpenCouncil (an out-of-network δήμος has no page to link to).
    const displayedMunicipality =
        centerMunicipality?.officialSupport
            ? {
                  id: centerMunicipality.id,
                  name: centerMunicipality.name,
                  nameMunicipality: centerMunicipality.nameMunicipality,
              }
            : null;
    // Lazily fetch its boundary geometry the first time it's selected, then cache it.
    useEffect(() => {
        if (!filterCityId || cityGeometries[filterCityId]) return;
        let cancelled = false;
        fetch(`/api/cities/${filterCityId}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
            .then((city: { geometry?: GeoJSON.Geometry } | null) => {
                if (!cancelled && city?.geometry) {
                    setCityGeometries((prev) => ({ ...prev, [filterCityId]: city.geometry! }));
                }
            });
        return () => {
            cancelled = true;
        };
    }, [filterCityId, cityGeometries]);

    // Bring the filtered municipality into view once its geometry is available, shifted to
    // ~2/3 of the width (right of the floating list) on desktop like a subject/click focus.
    useEffect(() => {
        if (!filterCityId) return;
        const geom = cityGeometries[filterCityId];
        if (!geom) return;
        if (mapInstance) flyToMunicipality(mapInstance, geom, isMobile);
        else setFlyTo(geom);
        // fit when the filter or its geometry changes — not on map remount (basemap toggle)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterCityId, cityGeometries]);

    // Delayed one-time "enable notifications" prompt for interested, not-logged-in visitors.
    const { showNotifyPrompt, nextMeeting: interestNextMeeting, onClose: onCloseNotify, onOptOut: optOutNotify } =
        useNotifyPrompt({ interested, upcoming, sessionStatus });

    // The map's feature layer (OC outlines, filter overlay, clicked-municipality shade, and
    // the geo / searched-address dots). Subject pins are HTML markers (see the effect below).
    const features = useMapFeatures({ geo, addressPoint, filterCityId, cityGeometries, clickedMunicipality, mapCities });

    // A ref keeps the latest selectSubject for the deep-link effect without re-firing it.
    const router = useRouter();
    const selectSubjectRef = useRef(selectSubject);
    selectSubjectRef.current = selectSubject;
    // Closes the OpenCouncil badge popup — set by useMapPopups, read by the general-city
    // markers and the "selection closes previews" rule inside useMapPopups.
    const closeExplainPopupRef = useRef<(() => void) | null>(null);

    // Deep link (?subject=…): once the map is ready and the subject is in the loaded data,
    // run the normal selection so it pans/zooms on the map and scrolls into the list. Runs
    // once — the ref is cleared after.
    useEffect(() => {
        const id = restoreSubjectRef.current;
        if (!id || !mapInstance) return;
        const found = allSubjects.some((s) => s.id === id) || allGeneralSubjects.some((s) => s.id === id);
        if (!found) return;
        restoreSubjectRef.current = null;
        selectSubjectRef.current(id);
    }, [mapInstance, allSubjects, allGeneralSubjects]);

    // Capture the map view (list + clustering + centered municipality) on every pan/zoom.
    useMapViewCapture({
        mapInstance,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        pendingGeneralRef,
        setClusterCell,
        setMapZoom,
        setCenterMunicipality,
        setCoLocated,
        setGeneralBox,
        setMapView,
    });

    // Subject pins (+ "+N" co-located markers and donut clusters) for the current viewport.
    useSubjectMarkers({
        mapInstance,
        subjectsActive,
        visibleSubjects,
        clusterCell,
        selectedId,
        onSelect: selectSubject,
        onClearSelection: clearSelection,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        setCoLocated,
    });

    // City-hall markers for municipalities with non-located subjects in view.
    useGeneralCityMarkers({
        mapInstance,
        subjectsActive,
        visibleGeneralCities,
        isMobile,
        onClearSelection: clearSelection,
        closeExplainPopupRef,
        suppressViewCaptureRef,
        pendingGeneralRef,
        setExplainOpen,
        setClickedMunicipality,
        setCoLocated,
        setGeneralBox,
    });

    // Municipality logo markers (only in the 'municipalities' view).
    useMunicipalityMarkers({
        mapInstance,
        view,
        mapCities,
        onOpenCity: (cityId) => router.push(`/${cityId}`),
    });

    // Map overlays: the desktop subject tooltip, the OpenCouncil badge + popup, and the
    // clicked out-of-network municipality preview (Mapbox popups rendered via createRoot).
    useMapPopups({
        mapInstance,
        isMobile,
        selectedId,
        selectedSubject,
        clickedMunicipality,
        navigate: (path) => router.push(path),
        onClearSelection: clearSelection,
        onShowExplainLocation: showExplainLocation,
        setExplainOpen,
        setClickedMunicipality,
        setGeneralBox,
        closeExplainPopupRef,
    });

    const mapNode = (
        <Map
            // remount on basemap switch; the camera is restored from cameraRef
            key={mapStyle}
            mapStyle={mapStyle}
            className="absolute inset-0 h-full w-full"
            center={cameraRef.current.center}
            zoom={cameraRef.current.zoom}
            pitch={0}
            animateRotation={false}
            features={features}
            onMapReady={handleMapReady}
            showStreetLabels={!satellite}
            showPois={!satellite}
            // the landing is a fixed full-screen map (no page scroll), so a plain wheel zooms
            cooperativeGestures={false}
            zoomToGeometry={flyTo}
            zoomPadding={isMobile ? 120 : 80}
        />
    );

    const layoutProps: LayoutProps = {
        // desktop has no 'home' tab → render 'home' as its 'subjects' split; mobile keeps all three
        view: isMobile ? view : desktopView(view),
        setView,
        cats,
        onToggleCat,
        onClearCats: clearCats,
        range,
        setRange,
        filters,
        setFilters,
        query,
        setQuery,
        queryKind,
        topics,
        cities,
        subjectCountByCity,
        upcoming,
        loading,
        selectedId,
        selectSubject,
        clearSelection,
        selectedSubject,
        ordered: listSubjects,
        trending: listSubjects,
        count: listSubjects.length,
        searchResults,
        coLocated,
        onCoLocatedSelect: (id: string) => {
            selectSubject(id);
            setCoLocated(null);
        },
        onCoLocatedClose: () => setCoLocated(null),
        generalBox,
        onGeneralSelect: (id: string) => {
            selectSubject(id);
            setGeneralBox(null);
        },
        onGeneralBoxClose: () => setGeneralBox(null),
        satellite,
        toggleMapStyle,
        locate,
        onLocateAddress: locateAddress,
        zoomIn,
        zoomOut,
        explainOpen,
        onCloseExplain: () => setExplainOpen(false),
        displayedMunicipality,
        mapNode,
    };

    return (
        <>
            {isMobile ? (
                <MobileLayout {...layoutProps} />
            ) : (
                // SSR + the first client render default to desktop (isMobile is false until
                // mounted). `hidden lg:contents` keeps that desktop tree out of the paint
                // below the lg breakpoint, so a phone never flashes the split layout before
                // hydration swaps in MobileLayout — display:contents leaves the layout intact.
                <div className="hidden lg:contents">
                    <DesktopLayout {...layoutProps} />
                </div>
            )}
            {showNotifyPrompt && interested && (
                <NotifyPrompt
                    interest={interested}
                    nextMeeting={interestNextMeeting}
                    onClose={onCloseNotify}
                    onOptOut={optOutNotify}
                />
            )}
        </>
    );
}
