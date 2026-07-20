'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import { useTranslations } from 'next-intl';
import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import type { Root } from 'react-dom/client';
import type { LatLng } from '@/lib/google-maps';
import { CENTER_QUERY_MOVE_RATIO, SUBJECT_FOCUS_ZOOM, stylePin, type SubjectPin } from '@/lib/landing/landingCore';
import {
    groupByLocation,
    type CenterMunicipality,
    type CoLocatedBox,
    type GeneralBox,
    type LandingGeneralCity,
    type LandingSubject,
    type MapViewport,
    type MunicipalitySubjectCount,
} from '@/lib/landing/landingData';
import { buildSubjectPins, createGeneralCityMarker, createMunicipalityCountMarker } from '../mapMarkers';
import { captureLandingAction } from '@/lib/landing/analytics';
import { spreadOverlappingMarkers } from '@/lib/landing/markerDeclutter';
import { MUNICIPALITY_DONUT_FOOTPRINT } from '@/lib/landing/donut';

/**
 * Capture the map view on every moveend so the list reacts to it. Resolves the municipality under
 * the center; finishes a pending co-located / city-hall pan by opening its box; otherwise closes the
 * boxes and publishes the new viewport. Selection pans set `suppressViewCapture` to skip refiltering.
 */
export function useMapViewCapture({
    mapInstance,
    suppressViewCaptureRef,
    pendingCoLocatedRef,
    pendingGeneralRef,
    setMapZoom,
    setCenterMunicipality,
    setCoLocated,
    setGeneralBox,
    setMapView,
    onUserNavigate,
}: {
    mapInstance: MapboxMap | null;
    suppressViewCaptureRef: MutableRefObject<boolean>;
    pendingCoLocatedRef: MutableRefObject<LandingSubject[] | null>;
    pendingGeneralRef: MutableRefObject<LandingGeneralCity | null>;
    setMapZoom: (v: number) => void;
    setCenterMunicipality: (v: CenterMunicipality | null) => void;
    setCoLocated: (v: CoLocatedBox | null) => void;
    setGeneralBox: (v: GeneralBox | null) => void;
    setMapView: (v: MapViewport) => void;
    /** fired on a genuine user pan/zoom (not a suppressed programmatic move) */
    onUserNavigate?: () => void;
}) {
    const centerReqRef = useRef(0);
    // Center of the last /api/cities/at query — the gate below re-queries only after the
    // center moves a meaningful fraction of the viewport away.
    const lastCenterQueryRef = useRef<LatLng | null>(null);
    useEffect(() => {
        if (!mapInstance) return;
        const capture = () => {
            setMapZoom(mapInstance.getZoom());

            const center = mapInstance.getCenter();
            const bounds = mapInstance.getBounds();
            // Municipality under the center → drives the "view its page" button. Skip the lookup
            // unless the center moved > CENTER_QUERY_MOVE_RATIO of the viewport since the last
            // query, so a pure zoom or tiny pan makes no network call. Threshold scales with zoom.
            if (bounds) {
                const spanLng = Math.abs(bounds.getEast() - bounds.getWest());
                const spanLat = Math.abs(bounds.getNorth() - bounds.getSouth());
                const last = lastCenterQueryRef.current;
                const movedEnough =
                    !last ||
                    Math.abs(center.lng - last.lng) > spanLng * CENTER_QUERY_MOVE_RATIO ||
                    Math.abs(center.lat - last.lat) > spanLat * CENTER_QUERY_MOVE_RATIO;
                if (movedEnough) {
                    lastCenterQueryRef.current = { lng: center.lng, lat: center.lat };
                    const reqId = ++centerReqRef.current;
                    fetch(`/api/cities/at?lng=${center.lng}&lat=${center.lat}`)
                        .then((r) => (r.ok ? r.json() : null))
                        .catch(() => null)
                        .then((city: { id: string; name: string; name_municipality: string; officialSupport: boolean } | null) => {
                            if (reqId === centerReqRef.current) {
                                setCenterMunicipality(
                                    city
                                        ? {
                                              id: city.id,
                                              name: city.name,
                                              nameMunicipality: city.name_municipality,
                                              officialSupport: city.officialSupport,
                                          }
                                        : null,
                                );
                            }
                        });
                }
            }
            // a "+N" pan finished → open the box at the now-centered point
            if (pendingCoLocatedRef.current) {
                const group = pendingCoLocatedRef.current;
                pendingCoLocatedRef.current = null;
                suppressViewCaptureRef.current = false;
                const p = mapInstance.project([group[0].lng, group[0].lat]);
                setCoLocated({ subjects: group, x: p.x, y: p.y });
                return;
            }
            // a city-hall pan finished → open the general box at the now-centered centroid
            if (pendingGeneralRef.current) {
                const city = pendingGeneralRef.current;
                pendingGeneralRef.current = null;
                suppressViewCaptureRef.current = false;
                const p = mapInstance.project([city.lng, city.lat]);
                setGeneralBox({ city, x: p.x, y: p.y });
                return;
            }
            // any other move closes the box(es)
            setCoLocated(null);
            setGeneralBox(null);
            // a selection pan holds back the list-driving view so the list stays put
            if (suppressViewCaptureRef.current) {
                suppressViewCaptureRef.current = false;
                return;
            }
            // a genuine user pan/zoom — drop any strip preview
            onUserNavigate?.();
            if (!bounds) return;
            setMapView({
                w: bounds.getWest(),
                s: bounds.getSouth(),
                e: bounds.getEast(),
                n: bounds.getNorth(),
                clng: center.lng,
                clat: center.lat,
            });
        };
        capture();
        mapInstance.on('moveend', capture);

        // Analytics: one debounced map_moved per exploration burst (kind + zoom level only —
        // no coordinates). User-initiated moves only: dragend is always a user gesture, and a
        // zoomend carries originalEvent only for wheel/pinch/dblclick (programmatic easeTo/flyTo
        // and the +/- buttons, which are tracked separately as map_zoom, don't).
        let moveDebounce: ReturnType<typeof setTimeout> | null = null;
        let movedKind: 'zoom' | 'pan' | null = null;
        const queueMoveCapture = (kind: 'zoom' | 'pan') => {
            movedKind = kind === 'zoom' ? 'zoom' : movedKind ?? 'pan'; // zoom wins over pan in a burst
            if (moveDebounce) clearTimeout(moveDebounce);
            moveDebounce = setTimeout(() => {
                captureLandingAction('map_moved', { kind: movedKind, zoom: Math.round(mapInstance.getZoom()) });
                movedKind = null;
            }, 1000);
        };
        const onDragEnd = () => queueMoveCapture('pan');
        // mapbox-gl's zoomend typing omits originalEvent, but the runtime event carries it
        // for gesture zooms (wheel/pinch/dblclick) and omits it for programmatic ones.
        const onZoomEnd = (e: object) => {
            if ((e as { originalEvent?: unknown }).originalEvent) queueMoveCapture('zoom');
        };
        mapInstance.on('dragend', onDragEnd);
        mapInstance.on('zoomend', onZoomEnd);

        return () => {
            mapInstance.off('moveend', capture);
            mapInstance.off('dragend', onDragEnd);
            mapInstance.off('zoomend', onZoomEnd);
            if (moveDebounce) clearTimeout(moveDebounce);
        };
        // setters + refs are stable; re-subscribe only when the map instance changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance]);
}

/**
 * Build the subject pins for the current viewport and keep them in sync. Co-located subjects merge
 * into a "+N" marker; the selected subject keeps its own highlighted pin (see buildSubjectPins).
 * A separate effect restyles pins on selection.
 */
export function useSubjectMarkers({
    mapInstance,
    active,
    visibleSubjects,
    selectedId,
    previewId,
    isMobile,
    onSelect,
    onClearSelection,
    suppressViewCaptureRef,
    pendingCoLocatedRef,
    setCoLocated,
}: {
    mapInstance: MapboxMap | null;
    /** gates the whole layer — off while the zoomed-out δήμος donuts have the map */
    active: boolean;
    visibleSubjects: LandingSubject[];
    selectedId: string | null;
    /** the mobile strip's previewed subject — its pin gets the intense filled style */
    previewId: string | null;
    /** mobile: the selected pin uses the same intense style as the preview */
    isMobile: boolean;
    onSelect: (id: string) => void;
    onClearSelection: () => void;
    suppressViewCaptureRef: MutableRefObject<boolean>;
    pendingCoLocatedRef: MutableRefObject<LandingSubject[] | null>;
    setCoLocated: (v: CoLocatedBox | null) => void;
}) {
    const pinsRef = useRef<SubjectPin[]>([]);
    const selectedIdRef = useRef(selectedId);
    selectedIdRef.current = selectedId;
    const previewIdRef = useRef(previewId);
    previewIdRef.current = previewId;
    const isMobileRef = useRef(isMobile);
    isMobileRef.current = isMobile;
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onClearSelectionRef = useRef(onClearSelection);
    onClearSelectionRef.current = onClearSelection;
    // t is ref'd so the marker-building effect doesn't re-run on every render
    const t = useTranslations('landingV2');
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        if (!mapInstance || !active) return;

        const openCoLocated = (group: LandingSubject[]) => {
            captureLandingAction('cluster_opened', { kind: 'co_located', size: group.length });
            // opening a "+N" box deselects any subject so its preview closes
            onClearSelectionRef.current();
            const lng = group[0].lng;
            const lat = group[0].lat;
            const c = mapInstance.getCenter();
            // Focus like a single-pin selection (selectSubject): center AND zoom in. A zoom delta
            // counts as movement so an already-centered point still eases in (and fires moveend).
            const targetZoom = Math.max(mapInstance.getZoom(), SUBJECT_FOCUS_ZOOM);
            const willMove =
                Math.abs(c.lng - lng) > 1e-6 ||
                Math.abs(c.lat - lat) > 1e-6 ||
                Math.abs(mapInstance.getZoom() - targetZoom) > 1e-3;
            if (willMove) {
                // center + zoom the location; the box opens after the pan
                suppressViewCaptureRef.current = true;
                pendingCoLocatedRef.current = group;
                mapInstance.easeTo({ center: [lng, lat], zoom: targetZoom, duration: 400 });
            } else {
                const p = mapInstance.project([lng, lat]);
                setCoLocated({ subjects: group, x: p.x, y: p.y });
            }
        };

        const pins = buildSubjectPins(mapInstance, groupByLocation(visibleSubjects), {
            selectedId: selectedIdRef.current,
            previewId: previewIdRef.current,
            isMobile: isMobileRef.current,
            onSelect: (id) => onSelectRef.current(id),
            onOpenCoLocated: openCoLocated,
            t: tRef.current,
        });
        pinsRef.current = pins;
        return () => {
            pinsRef.current = [];
            pins.forEach(({ marker, root }) => {
                marker.remove();
                // unmount async — React forbids unmounting a root mid-commit
                if (root) setTimeout(() => root.unmount(), 0);
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, visibleSubjects, active]);

    // Selection / strip-preview restyle the existing subject markers in place (no rebuild). On mobile
    // both the previewed and the selected pin get the intense filled style.
    useEffect(() => {
        pinsRef.current.forEach((pin) => {
            if (!pin.subject) return;
            const selected = pin.subject.id === selectedId;
            const intense = selected || pin.subject.id === previewId;
            stylePin(pin, pin.subject, selected, intense);
        });
    }, [selectedId, previewId, isMobile]);
}

/**
 * City-hall markers: one per municipality with non-located subjects in view. Clicking one
 * clears the other map previews and opens that δήμος's GeneralSubjectsBox after a centering pan.
 */
export function useGeneralCityMarkers({
    mapInstance,
    active,
    visibleGeneralCities,
    isMobile,
    onClearSelection,
    closeExplainPopupRef,
    suppressViewCaptureRef,
    pendingGeneralRef,
    setExplainOpen,
    setClickedMunicipality,
    setCoLocated,
    setGeneralBox,
}: {
    mapInstance: MapboxMap | null;
    /** gates the whole layer — off while the zoomed-out δήμος donuts have the map */
    active: boolean;
    visibleGeneralCities: LandingGeneralCity[];
    isMobile: boolean;
    onClearSelection: () => void;
    closeExplainPopupRef: MutableRefObject<(() => void) | null>;
    suppressViewCaptureRef: MutableRefObject<boolean>;
    pendingGeneralRef: MutableRefObject<LandingGeneralCity | null>;
    setExplainOpen: (v: boolean) => void;
    setClickedMunicipality: (v: null) => void;
    setCoLocated: (v: CoLocatedBox | null) => void;
    setGeneralBox: (v: GeneralBox | null) => void;
}) {
    const onClearSelectionRef = useRef(onClearSelection);
    onClearSelectionRef.current = onClearSelection;
    const isMobileRef = useRef(isMobile);
    isMobileRef.current = isMobile;
    const t = useTranslations('landingV2');
    const tRef = useRef(t);
    tRef.current = t;

    useEffect(() => {
        if (!mapInstance || !active) return;
        const markers: { marker: Marker; root: Root }[] = [];
        for (const city of visibleGeneralCities) {
            const { marker, root } = createGeneralCityMarker(mapInstance, city, () => {
                captureLandingAction('cluster_opened', { kind: 'city_hall', size: city.subjects.length, city_id: city.cityId });
                // opening the general box clears the other map previews
                onClearSelectionRef.current();
                closeExplainPopupRef.current?.();
                setExplainOpen(false);
                setClickedMunicipality(null);
                setCoLocated(null);
                const c = mapInstance.getCenter();
                // Only centre on the centroid — keep the current zoom (no zoom-in); the box opens
                // after the pan.
                const willMove = Math.abs(c.lng - city.lng) > 1e-6 || Math.abs(c.lat - city.lat) > 1e-6;
                if (willMove) {
                    // centre the centroid without zooming. desktop: shift right to clear the floating
                    // list. mobile: drop below center to clear the top controls.
                    suppressViewCaptureRef.current = true;
                    pendingGeneralRef.current = city;
                    mapInstance.easeTo({
                        center: [city.lng, city.lat],
                        duration: 400,
                        offset: isMobileRef.current ? [0, 120] : [210, 100],
                    });
                } else {
                    const p = mapInstance.project([city.lng, city.lat]);
                    setGeneralBox({ city, x: p.x, y: p.y });
                }
            }, tRef.current);
            markers.push({ marker, root });
        }
        return () => {
            markers.forEach(({ marker, root }) => {
                marker.remove();
                // unmount async — React forbids unmounting a root mid-commit
                setTimeout(() => root.unmount(), 0);
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, visibleGeneralCities, active]);
}

// Closest two donuts may sit, centre to centre: their drawn footprint plus a small gap, so
// neighbours read as separate objects instead of touching. Keyed to the footprint rather than the
// element box, whose lower half is empty reserve for the count. Fixed px — the donuts are a fixed
// size, so only the distance between their anchors changes with zoom.
const MUNICIPALITY_MARKER_SPACING = MUNICIPALITY_DONUT_FOOTPRINT + 4;

/**
 * Per-δήμος count labels for the zoomed-out view (see MUNICIPALITY_COUNT_MAX_ZOOM). `active` gates the
 * whole layer so it swaps cleanly with the pin/donut layer as the map crosses the zoom threshold.
 *
 * Every δήμος draws its own orange logo + number — the same marker, at the same size, meaning the
 * same thing at every zoom. Neighbours are never merged into a combined total and none are hidden.
 * Far out their centroids project close enough that the labels would pile up, so overlapping ones
 * are nudged aside just far enough to stay readable, and the nudge unwinds to nothing as zooming in
 * pulls the real positions apart. The nudge is recomputed on every moveend (the overlap follows the
 * projection); the markers themselves are built once per counts change and only repositioned.
 */
export function useMunicipalityCountMarkers({
    mapInstance,
    active,
    municipalityCounts,
    onZoomToCity,
}: {
    mapInstance: MapboxMap | null;
    active: boolean;
    municipalityCounts: MunicipalitySubjectCount[];
    onZoomToCity: (muni: MunicipalitySubjectCount) => void;
}) {
    const t = useTranslations('landingV2');
    const tRef = useRef(t);
    tRef.current = t;
    const onZoomRef = useRef(onZoomToCity);
    onZoomRef.current = onZoomToCity;

    useEffect(() => {
        if (!mapInstance || !active) return;
        const municipalities = municipalityCounts;

        // The declutter nudge is a pure function of where the centroids currently project, so it's
        // recomputed on every move — but that's all that changes per move. The donut SVG, logo and
        // count depend only on `municipalityCounts` (this effect's dep), so the markers are built
        // once here and repositioned via setOffset, never torn down and rebuilt on pan/zoom.
        const computeOffsets = () => {
            const points = municipalities.map((m) => mapInstance.project([m.lng, m.lat]));
            return spreadOverlappingMarkers(points, municipalities.map((m) => m.count), MUNICIPALITY_MARKER_SPACING);
        };

        const initial = computeOffsets();
        const markers = municipalities.map((muni, i) =>
            createMunicipalityCountMarker(
                mapInstance,
                muni,
                (m) => onZoomRef.current(m),
                tRef.current,
                [initial[i].x, initial[i].y],
            ),
        );

        const reposition = () => {
            const offsets = computeOffsets();
            markers.forEach((m, i) => m.setOffset([offsets[i].x, offsets[i].y]));
        };
        mapInstance.on('moveend', reposition);

        return () => {
            mapInstance.off('moveend', reposition);
            markers.forEach((m) => m.remove());
        };
    }, [mapInstance, active, municipalityCounts]);
}
