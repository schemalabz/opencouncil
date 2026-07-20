'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Map as MapboxMap } from 'mapbox-gl';
import { useSession } from 'next-auth/react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useTopics } from '@/hooks/useTopics';
import Map from '@/components/map/map';
import { useMapFeatures } from './hooks/useMapFeatures';
import { useMapActions } from './hooks/useMapActions';
import { useFilteredSubjects } from './hooks/useFilteredSubjects';
import { useLandingData, type LandingInitialData } from './hooks/useLandingData';
import { useNotifyPrompt } from './hooks/useNotifyPrompt';
import { useSubjectSelection } from './hooks/useSubjectSelection';
import {
    useGeneralCityMarkers,
    useMapViewCapture,
    useMunicipalityCountMarkers,
    useSubjectMarkers,
} from './hooks/useMapMarkers';
import { useMapPopups } from './hooks/useMapPopups';
import { captureLanding, captureLandingAction, setLandingContext } from '@/lib/landing/analytics';
import {
    aggregateMunicipalityCounts,
    detectMunicipalityQuery,
    isValidLngLat,
    type CenterMunicipality,
    type ClickedMunicipality,
    type CoLocatedBox,
    type GeneralBox,
    type LandingGeneralCity,
    type LandingSubject,
    type MapViewport,
    type MunicipalityInterest,
} from '@/lib/landing/landingData';
import {
    DEFAULT_RANGE,
    EMPTY_FILTERS,
    MUNICIPALITY_COUNT_MAX_ZOOM,
    MUNICIPALITY_PAGE_BUTTON_MIN_ZOOM,
    SUBJECT_FOCUS_ZOOM,
    desktopView,
    flyToMunicipality,
    parseInitialUrlState,
    type DateRangeKey,
    type LandingView,
    type LayoutProps,
    type MapFilters,
} from '@/lib/landing/landingCore';
import { readSavedView, writeSavedView } from '@/lib/landing/savedView';
import { calculateGeometryBounds, isInSupportedMunicipality } from '@/lib/geo';
import { useRouter } from '@/i18n/routing';
import { NotifyPrompt } from './NotifyPrompt';
import { DesktopLayout } from './DesktopLayout';
import { MobileLayout } from './MobileLayout';

/**
 * The consolidated landing redesign (issue #208). Desktop (≥ lg): split-screen map + tabbed
 * side panel; mobile: immersive map-first layout. Only one <Map> is mounted at a time.
 *
 * Initial data is server-resolved in page.tsx (realm-scoped) and passed as typed props, so the
 * map renders real data on first paint. Only filter/geocode/cities-at lookups stay client-side.
 */
export type LandingV2Props = {
    /** realm-resolved initial map framing — server passes getRealmDefaultMapView(realm) */
    defaultView: { center: [number, number]; zoom: number };
    /** server-loaded initial data (see page.tsx / the db-layer finders) */
    initial: LandingInitialData;
};

export function LandingV2({ defaultView, initial }: LandingV2Props) {
    // Where the map opens. A view the visitor themselves left is better evidence of what they want
    // than the realm's generic framing, so it wins over `defaultView`.
    const [initialView] = useState(() => {
        // A `?subject=` link owns the camera — it flies to the subject on mount, so restoring a
        // saved view first would only add a detour on the way.
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('subject')) {
            return defaultView;
        }
        const saved = readSavedView();
        // Only restore a view over a δήμος we actually cover.
        if (!saved || !isInSupportedMunicipality(saved.center, initial.mapCities)) return defaultView;
        return saved;
    });
    // Selected topic ids — empty means "all".
    const [cats, setCats] = useState<string[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Which panel/list is showing. The map is unaffected — it always shows subject pins; the Δήμοι
    // tab picks a δήμος to filter them by. Desktop has no 'home' (iteration 1); mobile keeps it
    // (restored on mount in the URL-init effect).
    const [view, setView] = useState<LandingView>('subjects');
    // The "?" info drawer — an overlay explaining the map, independent of `view` (map markers stay).
    const [infoOpen, setInfoOpen] = useState(false);
    // Mobile: the OpenCouncil badge shows a card preview (like a subject), not a tooltip.
    const [explainOpen, setExplainOpen] = useState(false);
    // Mobile: the strip's in-view subject — its map pin gets an orange preview outline.
    const [previewId, setPreviewId] = useState<string | null>(null);
    // Captured on moveend — drives the in-view list.
    const [mapView, setMapView] = useState<MapViewport | null>(null);
    // Non-located subjects show in the list only while zoomed out (< this).
    const [mapZoom, setMapZoom] = useState(initialView.zoom);
    // Subjects at one point + screen position.
    const [coLocated, setCoLocated] = useState<CoLocatedBox | null>(null);
    // A municipality's non-located subjects + screen position.
    const [generalBox, setGeneralBox] = useState<GeneralBox | null>(null);

    // The municipality the visitor seems interested in (filter, clicked subject, or "δήμος X"
    // search) → drives the delayed notification prompt.
    const { status: sessionStatus } = useSession();
    const [interested, setInterested] = useState<MunicipalityInterest | null>(null);

    // Default to desktop during SSR (matches=false until mounted) so desktop has no layout
    // flash; mobile flips in after hydration.
    const isMobile = useMediaQuery('(max-width: 1023px)');

    // On breakpoint cross, remap any stray 'home' (mobile-only leftover) to 'subjects' for
    // desktop; mobile keeps it. First run skipped — parseInitialUrlState already picked the view.
    const layoutSyncedRef = useRef(false);
    useEffect(() => {
        if (!layoutSyncedRef.current) {
            layoutSyncedRef.current = true;
            return;
        }
        setView((v) => (isMobile ? v : v === 'home' ? 'subjects' : v));
    }, [isMobile]);

    // Keep the analytics context in sync so every landing_* event carries device + view.
    useEffect(() => {
        setLandingContext({ device: isMobile ? 'mobile' : 'desktop', view });
    }, [isMobile, view]);

    // Subject pins are HTML markers added onto this (to carry the topic's lucide icon); the zoom
    // buttons drive it directly.
    const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
    const handleMapReady = useCallback((m: MapboxMap) => setMapInstance(m), []);

    // Map camera actions and the state they own (geo dot, address point, fly-to, basemap, camera).
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
        geoError,
        dismissGeoError,
        locateAddress,
        zoomIn,
        zoomOut,
        showExplainLocation,
    } = useMapActions({ mapInstance, isMobile, defaultView: initialView });
    // Set before a selection-triggered pan so the next moveend doesn't refilter the list.
    const suppressViewCaptureRef = useRef(false);
    // A co-located "+N" pan centers the point first, then opens the box on the next moveend.
    const pendingCoLocatedRef = useRef<LandingSubject[] | null>(null);
    // A city-hall pan centers the centroid first, then opens the general box on the next moveend.
    const pendingGeneralRef = useRef<LandingGeneralCity | null>(null);

    // ---- real data ----
    const { topics } = useTopics();
    // Per-city boundary geometry, fetched lazily on municipality filter, cached by id (shades the
    // selected δήμος blue-gray).
    const [cityGeometries, setCityGeometries] = useState<Record<string, GeoJSON.Geometry>>({});
    // An out-of-network municipality the user clicked on the map — shaded orange.
    const [clickedMunicipality, setClickedMunicipality] = useState<ClickedMunicipality | null>(null);
    // The municipality under the map center (updated on every move) — drives the "view its page"
    // button. officialSupport gates it: shown only for δήμοι actually in OpenCouncil.
    const [centerMunicipality, setCenterMunicipality] = useState<CenterMunicipality | null>(null);

    const [range, setRange] = useState<DateRangeKey>(DEFAULT_RANGE);
    const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);
    const [query, setQuery] = useState('');
    // A free-text search ignores the range dropdown so it spans every subject (see useLandingData).
    const searching = query.trim().length > 0;
    const { cities, upcoming, subjectCountByCity, mapCities, mapSubjects, generalRows, loading } = useLandingData({
        range,
        filters,
        searching,
        initial,
    });

    // ---- URL state sync ----
    // A subject id restored from the URL, pending a map fly-to once the data + map are ready.
    const restoreSubjectRef = useRef<string | null>(null);
    // Restore selection + filters from the URL on first mount (client-only, to avoid a hydration
    // mismatch).
    useEffect(() => {
        const init = parseInitialUrlState(window.location.search);
        setSelectedId(init.selectedId);
        if (init.selectedId) restoreSubjectRef.current = init.selectedId;
        setView(init.view);
        setInfoOpen(init.infoOpen);
        setCats(init.cats);
        setQuery(init.query);
        setRange(init.range);
        setFilters(init.filters);
        setLandingContext({ view: init.view });
        captureLanding('viewed', {
            view: init.view,
            range: init.range,
            has_query: !!init.query.trim(),
            has_filters:
                init.cats.length > 0 ||
                init.filters.cityIds.length > 0 ||
                init.filters.bodyTypes.length > 0 ||
                init.filters.dateFrom != null ||
                init.filters.dateTo != null ||
                init.filters.minDuration != null,
            deep_linked_subject: !!init.selectedId,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reflect selection + filters in the URL (no navigation, so it's shareable and survives a
    // reload). First run skipped — the URL is the source then.
    const urlWroteOnceRef = useRef(false);
    useEffect(() => {
        if (!urlWroteOnceRef.current) {
            urlWroteOnceRef.current = true;
            return;
        }
        const p = new URLSearchParams();
        // The help drawer is encoded as view=help (over the subjects map); otherwise the real view.
        if (infoOpen) p.set('view', 'help');
        else if (view !== 'subjects') p.set('view', view);
        if (selectedId) p.set('subject', selectedId);
        if (cats.length) p.set('cat', cats.join(','));
        if (query.trim()) p.set('q', query.trim());
        if (range !== DEFAULT_RANGE) p.set('range', range);
        if (filters.cityIds.length) p.set('city', filters.cityIds[0]);
        if (filters.bodyTypes.length) p.set('body', filters.bodyTypes.join(','));
        if (filters.dateFrom) p.set('from', filters.dateFrom);
        if (filters.dateTo) p.set('to', filters.dateTo);
        const qs = p.toString();
        window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, [view, infoOpen, selectedId, cats, query, range, filters]);

    // All derived subject views (see useFilteredSubjects).
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
        cats,
        query,
        filters,
        addressPoint,
        mapView,
        mapZoom,
        selectedId,
        previewId,
    });

    // Total subjects per δήμος (located + non-located), from the same filtered sets the list uses.
    const municipalityCounts = useMemo(
        () => aggregateMunicipalityCounts(visibleSubjects, visibleGeneralCities, mapCities),
        [visibleSubjects, visibleGeneralCities, mapCities],
    );
    // Zoomed out, the map shows the per-δήμος count numbers instead of individual subject pins; past
    // MUNICIPALITY_COUNT_MAX_ZOOM the subjects (pins/dots) take over.
    const showMunicipalityCounts = mapZoom <= MUNICIPALITY_COUNT_MAX_ZOOM;

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

    // Selecting a subject (map pin, search) closes the info drawer so its preview is visible, and
    // drops any strip-preview outline (the selected pin's own highlight takes over).
    useEffect(() => {
        if (selectedId) {
            setInfoOpen(false);
            setPreviewId(null);
        }
    }, [selectedId]);

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

    // The municipality chosen in the filters (single-select) — drives the blue-gray overlay.
    const filterCityId = filters.cityIds[filters.cityIds.length - 1] ?? null;
    // "View its page" tracks the centered municipality as the user pans/zooms — but only for
    // δήμοι in OpenCouncil (out-of-network ones have no page to link to), and only once zoomed in
    // enough that a single δήμος is actually the focus (not the country-level default framing).
    const displayedMunicipality =
        centerMunicipality?.officialSupport && mapZoom >= MUNICIPALITY_PAGE_BUTTON_MIN_ZOOM
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

    // Bring the filtered municipality into view once its geometry is available (desktop shifts
    // it right of the floating list, like a subject focus).
    useEffect(() => {
        if (!filterCityId) return;
        const geom = cityGeometries[filterCityId];
        if (!geom) return;
        // floor the zoom past the count threshold so a large δήμος shows its subjects, not a count
        // bubble — the same floor the donut-click path uses (out-of-network clicks pass no floor).
        if (mapInstance) flyToMunicipality(mapInstance, geom, isMobile, MUNICIPALITY_COUNT_MAX_ZOOM + 1);
        else setFlyTo(geom);
        // fit when the filter or its geometry changes — not on map remount (basemap toggle)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterCityId, cityGeometries]);

    // Delayed one-time "enable notifications" prompt for interested, not-logged-in visitors.
    const { showNotifyPrompt, nextMeeting: interestNextMeeting, onClose: onCloseNotify, onOptOut: optOutNotify } =
        useNotifyPrompt({ interested, upcoming, sessionStatus });

    // The map's feature layer (OC outlines, filter overlay, clicked-municipality shade, geo/address
    // dots). Subject pins are HTML markers (see the effect below).
    const features = useMapFeatures({ geo, addressPoint, filterCityId, cityGeometries, clickedMunicipality, mapCities });

    // A ref keeps the latest selectSubject for the deep-link effect without re-firing it.
    const router = useRouter();
    const selectSubjectRef = useRef(selectSubject);
    selectSubjectRef.current = selectSubject;
    // Closes the OpenCouncil badge popup — set by useMapPopups, read by the general-city markers.
    const closeExplainPopupRef = useRef<(() => void) | null>(null);

    // Deep link (?subject=…): once the map is ready and the subject is loaded, run the normal
    // selection (pans/zooms + scrolls into the list). Runs once — the ref is cleared after.
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
        setMapZoom,
        setCenterMunicipality,
        setCoLocated,
        setGeneralBox,
        setMapView,
        // Navigating the map drops any strip preview (so the map doesn't snap back to it).
        onUserNavigate: () => setPreviewId(null),
    });

    // Remember the camera so a return visit opens where this one ended. Written on every settled
    // move rather than on leave: moveend fires once per gesture (cheap), while leave-events are
    // unreliable — pagehide/unload are skipped by bfcache and can be missed entirely when a
    // mobile OS kills a backgrounded tab, losing the whole session's exploration.
    //
    // Deliberately every move, not just user gestures: flying to a subject or to "my location"
    // is equally "where they were last", and that's what they'd expect to come back to.
    //
    // Only saved when a covered δήμος is in the viewport, so panning off to empty areas (the sea,
    // abroad) doesn't overwrite the last useful view with one that would just be rejected on return.
    const mapCitiesRef = useRef(mapCities);
    mapCitiesRef.current = mapCities;
    useEffect(() => {
        if (!mapInstance) return;
        const save = () => {
            const b = mapInstance.getBounds();
            if (!b) return;
            const municipalityInView = mapCitiesRef.current.some(
                (city) =>
                    city.lng >= b.getWest() &&
                    city.lng <= b.getEast() &&
                    city.lat >= b.getSouth() &&
                    city.lat <= b.getNorth(),
            );
            if (!municipalityInView) return;
            const c = mapInstance.getCenter();
            writeSavedView({ center: [c.lng, c.lat], zoom: mapInstance.getZoom() });
        };
        mapInstance.on('moveend', save);
        return () => {
            mapInstance.off('moveend', save);
        };
    }, [mapInstance]);

    // Record where we actually landed. Without this a rejected saved view (uncovered δήμος, or
    // another country) would sit in storage being re-rejected on every future visit; writing the
    // view we fell back to retires it. From here the moveend handler above takes over.
    useEffect(() => {
        writeSavedView(initialView);
    }, [initialView]);

    // Selection funnel: every user-initiated selection fires subject_selected with where it came
    // from. NOT inside selectSubject itself — the deep-link effect also calls that, and a page
    // load must not count as the session's first action.
    const trackedSelectSubject = (id: string, source: 'list' | 'search' | 'map_pin' | 'cluster' | 'city_hall') => {
        const s = findSubject(id);
        captureLandingAction('subject_selected', { subject_id: id, city_id: s?.cityId ?? null, source });
        selectSubject(id);
    };

    // Preview a subject (mobile): highlight its pin, navigate the map to it (like a selection, but
    // no box), and keep the strip list order unchanged (the strip just scrolls to it). The pan is
    // suppressed so the moveend neither refilters the list nor clears the preview.
    const previewSubject = (id: string | null) => {
        setPreviewId(id);
        if (!id || !mapInstance) return;
        const s = findSubject(id);
        if (!s || !isValidLngLat(s.lng, s.lat)) return;
        suppressViewCaptureRef.current = true;
        mapInstance.easeTo({
            center: [s.lng, s.lat],
            zoom: Math.max(mapInstance.getZoom(), SUBJECT_FOCUS_ZOOM),
            duration: 500,
        });
    };

    // A marker tap: mobile previews it (highlight + navigate, no box); desktop selects it (opens the
    // tooltip/preview) and reports the funnel source.
    const onMarkerClick = (id: string, source: 'map_pin' | 'cluster' | 'city_hall') => {
        if (isMobile) previewSubject(id);
        else trackedSelectSubject(id, source);
    };

    // Subject pins (+ "+N" co-located markers and donut clusters) for the current viewport. Yields
    // to the per-δήμος count bubbles while zoomed out.
    useSubjectMarkers({
        mapInstance,
        active: !showMunicipalityCounts,
        visibleSubjects,
        selectedId,
        previewId,
        isMobile,
        onSelect: (id) => onMarkerClick(id, 'map_pin'),
        onClearSelection: clearSelection,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        setCoLocated,
    });

    // City-hall markers for municipalities with non-located subjects in view. Also yields to the
    // count bubbles while zoomed out (their totals already include these non-located subjects).
    useGeneralCityMarkers({
        mapInstance,
        active: !showMunicipalityCounts,
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

    // Zoomed-out per-δήμος count bubbles — click frames the δήμος (past the count threshold, into
    // the pin/donut view). Falls back to a centroid ease when the δήμος has no boundary in the payload.
    useMunicipalityCountMarkers({
        mapInstance,
        active: showMunicipalityCounts,
        municipalityCounts,
        onZoomToCity: (muni) => {
            if (!mapInstance) return;
            // cameraForBounds gives the fit zoom for the boundary (large δήμος → lower, small → higher);
            // floor it one past MUNICIPALITY_COUNT_MAX_ZOOM so the δήμος's subjects always show (mobile
            // goes a touch closer still). Desktop offsets the δήμος to the right ~2/3 of the screen, so
            // it sits clear of the floating list on the left rather than under it.
            const offset: [number, number] = isMobile ? [0, 0] : [mapInstance.getContainer().clientWidth / 6, 0];
            const { bounds } = muni.geometry ? calculateGeometryBounds(muni.geometry) : { bounds: null };
            const fit = bounds
                ? mapInstance.cameraForBounds(
                      [
                          [bounds.minLng, bounds.minLat],
                          [bounds.maxLng, bounds.maxLat],
                      ],
                      { padding: isMobile ? 40 : 50 },
                  )
                : null;
            const zoom =
                fit?.zoom != null
                    ? Math.max(fit.zoom + (isMobile ? 1 : 0), MUNICIPALITY_COUNT_MAX_ZOOM + 1)
                    : MUNICIPALITY_PAGE_BUTTON_MIN_ZOOM;
            mapInstance.easeTo({ center: [muni.lng, muni.lat], zoom, offset, duration: 600 });
        },
    });

    // Map overlays: desktop subject tooltip, OpenCouncil badge + popup, and the clicked
    // out-of-network municipality preview (Mapbox popups rendered via createRoot).
    useMapPopups({
        mapInstance,
        isMobile,
        selectedId,
        selectedSubject,
        clickedMunicipality,
        // Hide the office badge in the zoomed-out count view (it would pile onto Athens' number) and
        // while the Δήμοι tab is open, where the map is about the δήμοι themselves.
        showExplainMarker: !showMunicipalityCounts && view !== 'municipalities',
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

    // Analytics-tracked wrappers — used ONLY in layoutProps, so the internal setState calls above
    // stay untracked; only user actions fire.
    const trackedSetView = (v: LandingView) => {
        if (v !== view) captureLandingAction('view_changed', { to: v });
        setInfoOpen(false); // switching to a real tab closes the info drawer
        setView(v);
    };
    const toggleInfo = () => {
        if (!infoOpen) {
            captureLandingAction('info_opened', {});
            // The drawer explains the subjects map, so anchor it to that view (e.g. opening it from
            // the municipalities tab): the legend and the map underneath always agree.
            setView('subjects');
        }
        setInfoOpen((o) => !o);
    };
    const trackedToggleCat = (id: string) => {
        captureLandingAction('filter', { type: 'topic', topic_id: id, active: !cats.includes(id) });
        onToggleCat(id);
    };
    const trackedSetRange = (v: DateRangeKey) => {
        captureLandingAction('filter', { type: 'range', value: v });
        setRange(v);
    };
    const trackedSetFilters = (next: MapFilters) => {
        captureLandingAction('filter', {
            type: 'pane',
            city_count: next.cityIds.length,
            body_types: next.bodyTypes,
            date_from: next.dateFrom ?? null,
            date_to: next.dateTo ?? null,
            min_duration: next.minDuration ?? null,
        });
        setFilters(next);
    };
    const trackedZoomIn = () => {
        captureLandingAction('map_zoom', { direction: 'in', method: 'button' });
        zoomIn();
    };
    const trackedZoomOut = () => {
        captureLandingAction('map_zoom', { direction: 'out', method: 'button' });
        zoomOut();
    };
    const trackedToggleMapStyle = () => {
        captureLandingAction('map_style_changed', { to: satellite ? 'map' : 'satellite' });
        toggleMapStyle();
    };

    const layoutProps: LayoutProps = {
        // desktop has no 'home' tab → render 'home' as its 'subjects' split; mobile keeps all three
        view: isMobile ? view : desktopView(view),
        setView: trackedSetView,
        infoOpen,
        onToggleInfo: toggleInfo,
        cats,
        onToggleCat: trackedToggleCat,
        setCats,
        onClearCats: clearCats,
        range,
        setRange: trackedSetRange,
        filters,
        setFilters: trackedSetFilters,
        query,
        setQuery,
        queryKind,
        topics,
        cities,
        subjectCountByCity,
        upcoming,
        loading,
        selectedId,
        selectSubject: (id: string, source: 'list' | 'search' = 'list') => trackedSelectSubject(id, source),
        clearSelection,
        selectedSubject,
        ordered: listSubjects,
        trending: listSubjects,
        count: listSubjects.length,
        searchResults,
        coLocated,
        // mobile: a co-located / general subject opens the preview (not the full selection)
        onCoLocatedSelect: (id: string) => {
            onMarkerClick(id, 'cluster');
            setCoLocated(null);
        },
        onCoLocatedClose: () => setCoLocated(null),
        generalBox,
        onGeneralSelect: (id: string) => {
            onMarkerClick(id, 'city_hall');
            setGeneralBox(null);
        },
        onGeneralBoxClose: () => setGeneralBox(null),
        satellite,
        toggleMapStyle: trackedToggleMapStyle,
        locate,
        geoError,
        onDismissGeoError: dismissGeoError,
        onLocateAddress: locateAddress,
        zoomIn: trackedZoomIn,
        zoomOut: trackedZoomOut,
        overviewActive: showMunicipalityCounts,
        previewId,
        previewSubject,
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
                // SSR + first client render default to desktop (isMobile false until mounted).
                // `hidden lg:contents` keeps the desktop tree unpainted below lg, so a phone never
                // flashes the split layout before hydration swaps in MobileLayout.
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
