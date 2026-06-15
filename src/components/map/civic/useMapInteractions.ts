import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type mapboxgl from 'mapbox-gl';
import { FLY_TO_DURATION_MS, FLY_TO_MIN_ZOOM } from '@/lib/map/constants';
import { anchorKeyOf } from '@/lib/map/spiderfy';
import type { MapMunicipality, MapSubject } from '@/lib/map/types';
import { attachSubjectsLayer, topicsFromSubjects, type SubjectsLayerHandle } from './subjectsLayer';
import { createDonutMarkerPool, type DonutMarkerPool } from './donutMarkerPool';
import { createSpiderfier, type Spiderfier } from './spiderfier';
import { BOUNDARY_FADE_END_ZOOM, MUNICIPALITIES_FILL_LAYER_ID } from './municipalitiesLayer';
import { DEFAULT_MARKER_OPTIONS, type CivicMapMarkerOptions, type CivicMapProps } from './types';

/** The page callbacks CivicMap holds in a ref (so listeners read the latest). */
export type CivicMapCallbacks = Pick<
    CivicMapProps,
    'onMunicipalityClick' | 'onMoveEnd' | 'onMapReady' | 'onSubjectSelect' | 'onSubjectHover' | 'onSpiderfyChange'
>;

interface UseMapInteractionsOptions {
    interactive: boolean;
    reducedMotion: boolean;
    subjects: MapSubject[];
    selectedSubjectId?: string | null;
    hoveredSubjectId?: string | null;
    flyToSelected?: boolean;
    markerOptions?: Partial<CivicMapMarkerOptions>;
    clusterAriaLabel?: (count: number) => string;
    /** Held by CivicMap (also drives the municipalities layer). */
    municipalitiesByIdRef: MutableRefObject<Map<string, MapMunicipality>>;
    /** Held by CivicMap (shared with the camera control and the handle). */
    paddingRef: MutableRefObject<number | mapboxgl.PaddingOptions>;
    /** Held by CivicMap (the latest page callbacks). */
    callbacksRef: MutableRefObject<CivicMapCallbacks>;
}

/**
 * Everything about subjects ON the map and how you interact with them: the
 * clustered subjects layer + donut marker pool + spiderfier, selection
 * highlight and fly-to, external (panel) hover, and the unified click resolver
 * — a subject within 8px wins over a municipality, an empty click clears.
 * Lifted out of CivicMap so the component reads as instance + layers + camera +
 * handle. Padding, callbacks and the municipalities lookup are owned by CivicMap
 * and passed in as refs, so the heavy listeners here still register once and
 * never go stale.
 */
export function useMapInteractions(
    map: mapboxgl.Map | null,
    isLoaded: boolean,
    options: UseMapInteractionsOptions,
): void {
    const {
        interactive, reducedMotion, subjects,
        selectedSubjectId, hoveredSubjectId, flyToSelected,
        markerOptions: markerOptionsProp, clusterAriaLabel,
        municipalitiesByIdRef, paddingRef, callbacksRef,
    } = options;

    const subjectsById = useMemo(
        () => new Map(subjects.map(subject => [subject.id, subject])),
        [subjects],
    );
    const subjectsByIdRef = useRef(subjectsById);
    subjectsByIdRef.current = subjectsById;
    const subjectsRef = useRef(subjects);
    subjectsRef.current = subjects;

    // Subjects sharing the exact same spot (~0.1m) — the spiderfier's groups
    const subjectsByAnchor = useMemo(() => {
        const groups = new Map<string, MapSubject[]>();
        for (const subject of subjects) {
            if (!subject.anchor) continue;
            const key = anchorKeyOf(subject.anchor);
            const group = groups.get(key);
            if (group) {
                group.push(subject);
            } else {
                groups.set(key, [subject]);
            }
        }
        return groups;
    }, [subjects]);
    const subjectsByAnchorRef = useRef(subjectsByAnchor);
    subjectsByAnchorRef.current = subjectsByAnchor;

    // Marker options are read once at attach — pages configure them per
    // surface, not per render.
    const markerOptionsRef = useRef({ ...DEFAULT_MARKER_OPTIONS, ...markerOptionsProp });
    const clusterAriaLabelRef = useRef(clusterAriaLabel);
    clusterAriaLabelRef.current = clusterAriaLabel;

    // Subjects: clustered source + pins/dots layers + donut marker pool
    const subjectsHandleRef = useRef<SubjectsLayerHandle | null>(null);
    const donutPoolRef = useRef<DonutMarkerPool | null>(null);

    // Spiderfier: co-located subjects fan out so each stays selectable
    const spiderfierRef = useRef<Spiderfier | null>(null);
    const closeSpiderfier = useCallback(() => {
        if (spiderfierRef.current?.isOpen()) {
            spiderfierRef.current.close();
            subjectsHandleRef.current?.setHiddenAnchorKey(null);
            callbacksRef.current.onSpiderfyChange?.(null);
        }
    }, [callbacksRef]);
    const openSpiderfier = useCallback((group: MapSubject[], anchor: [number, number]) => {
        if (!spiderfierRef.current) return;
        subjectsHandleRef.current?.setHiddenAnchorKey(anchorKeyOf(anchor));
        spiderfierRef.current.open(group, anchor);
        callbacksRef.current.onSpiderfyChange?.(group.map(subject => subject.id));
    }, [callbacksRef]);
    useEffect(() => {
        if (!map || !isLoaded) return;
        const markerOptions = markerOptionsRef.current;
        subjectsHandleRef.current = attachSubjectsLayer(map, subjectsRef.current, {
            ...markerOptions,
            interactive,
            onHover: subjectId => callbacksRef.current.onSubjectHover?.(subjectId),
        });
        if (interactive && markerOptions.spiderfy) {
            spiderfierRef.current = createSpiderfier(map, {
                reducedMotion,
                onSelect: subject => {
                    closeSpiderfier();
                    callbacksRef.current.onSubjectSelect?.(subject);
                },
                onHover: subjectId => callbacksRef.current.onSubjectHover?.(subjectId),
            });
        }
        if (markerOptions.clusterMode === 'donut') {
            donutPoolRef.current = createDonutMarkerPool(map, {
                topics: topicsFromSubjects(subjectsRef.current),
                clusterAriaLabel: count => clusterAriaLabelRef.current?.(count) ?? `${count}`,
                reducedMotion,
                clusterMaxZoom: markerOptions.clusterMaxZoom,
                onUnexpandable: (subjectIds, lngLat) => {
                    const group = subjectIds
                        .map(id => subjectsByIdRef.current.get(id))
                        .filter((subject): subject is MapSubject & { anchor: [number, number] } => Boolean(subject?.anchor));
                    const sharedAnchors = new Set(group.map(subject => anchorKeyOf(subject.anchor)));
                    const pinsZoom = markerOptions.clusterMaxZoom + 1;

                    // One shared spot → settle the camera there, then fan out.
                    if (markerOptions.spiderfy && interactive && group.length > 1 && sharedAnchors.size === 1) {
                        const anchor = group[0].anchor;
                        const center = map.getCenter();
                        const needsMove = map.getZoom() < pinsZoom - 0.05 ||
                            Math.abs(center.lng - anchor[0]) > 0.0005 ||
                            Math.abs(center.lat - anchor[1]) > 0.0005;
                        if (needsMove) {
                            map.once('moveend', () => openSpiderfier(group, anchor));
                            map.easeTo({
                                center: anchor,
                                zoom: Math.max(map.getZoom(), pinsZoom),
                                padding: paddingRef.current,
                                duration: reducedMotion ? 0 : 600,
                            });
                        } else {
                            openSpiderfier(group, anchor);
                        }
                        return;
                    }
                    // Distinct-but-close points: jump past the clustering
                    // ceiling and let individual pins take over.
                    map.easeTo({
                        center: lngLat,
                        zoom: pinsZoom + 0.2,
                        padding: paddingRef.current,
                        duration: reducedMotion ? 0 : 600,
                    });
                },
            });
        }
        return () => {
            spiderfierRef.current?.destroy();
            spiderfierRef.current = null;
            donutPoolRef.current?.destroy();
            donutPoolRef.current = null;
            subjectsHandleRef.current?.destroy();
            subjectsHandleRef.current = null;
        };
        // reducedMotion is intentionally captured at attach time
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, isLoaded, interactive]);
    useEffect(() => {
        closeSpiderfier();
        subjectsHandleRef.current?.update(subjects);
        donutPoolRef.current?.setTopics(topicsFromSubjects(subjects));
    }, [subjects, closeSpiderfier]);

    // Zooming re-arranges clusters under the fan — fold it back in.
    useEffect(() => {
        if (!map || !isLoaded) return;
        const onZoomStart = () => closeSpiderfier();
        map.on('zoomstart', onZoomStart);
        return () => {
            map.off('zoomstart', onZoomStart);
        };
    }, [map, isLoaded, closeSpiderfier]);

    // Selection (panel click or map click): highlight + gentle camera focus
    const selectedSubject = selectedSubjectId ? subjectsById.get(selectedSubjectId) ?? null : null;
    useEffect(() => {
        if (!map || !isLoaded) return;
        subjectsHandleRef.current?.setSelected(selectedSubject);
        if (!selectedSubject || !selectedSubject.anchor || flyToSelected === false || !interactive) return;

        const [lng, lat] = selectedSubject.anchor;
        const bounds = map.getBounds();
        const inView = Boolean(bounds && lng >= bounds.getWest() && lng <= bounds.getEast() &&
            lat >= bounds.getSouth() && lat <= bounds.getNorth());
        // Already on screen at street level → just recenter. Anything else
        // (off-screen, or hidden inside a cluster at low zoom) → fly in.
        if (inView && map.getZoom() >= 11) {
            map.easeTo({ center: [lng, lat], padding: paddingRef.current, duration: reducedMotion ? 0 : 300 });
        } else {
            map.flyTo({
                center: [lng, lat],
                zoom: Math.max(map.getZoom(), FLY_TO_MIN_ZOOM),
                padding: paddingRef.current,
                duration: reducedMotion ? 0 : FLY_TO_DURATION_MS,
                essential: true,
            });
        }
    }, [map, isLoaded, selectedSubject, flyToSelected, interactive, reducedMotion]);

    // External hover (panel rows)
    useEffect(() => {
        if (!map || !isLoaded) return;
        subjectsHandleRef.current?.setHovered(hoveredSubjectId ?? null);
    }, [map, isLoaded, hoveredSubjectId]);

    // Unified click resolution: subjects (8px hit slop) win over
    // municipalities; empty clicks clear the selection.
    useEffect(() => {
        if (!map || !isLoaded || !interactive) return;
        const onClick = (event: mapboxgl.MapMouseEvent) => {
            // An open fan treats any map click as "dismiss" (badge clicks
            // don't reach the canvas).
            if (spiderfierRef.current?.isOpen()) {
                closeSpiderfier();
                return;
            }
            const subjectLayers = subjectsHandleRef.current?.hitTestLayerIds() ?? [];
            if (subjectLayers.length > 0) {
                const { x, y } = event.point;
                const hits = map.queryRenderedFeatures(
                    [[x - 8, y - 8], [x + 8, y + 8]],
                    { layers: subjectLayers },
                );
                const hit = hits[0];
                const hitId = hit?.id ?? hit?.properties?.id;
                if (hitId != null) {
                    const subject = subjectsByIdRef.current.get(String(hitId)) ?? null;
                    if (subject?.anchor && markerOptionsRef.current.spiderfy) {
                        const group = subjectsByAnchorRef.current.get(anchorKeyOf(subject.anchor));
                        if (group && group.length > 1) {
                            openSpiderfier(group, subject.anchor);
                            return;
                        }
                    }
                    callbacksRef.current.onSubjectSelect?.(subject);
                    return;
                }
            }
            if (map.getLayer(MUNICIPALITIES_FILL_LAYER_ID) && map.getZoom() < BOUNDARY_FADE_END_ZOOM) {
                const muniHit = map.queryRenderedFeatures(event.point, { layers: [MUNICIPALITIES_FILL_LAYER_ID] })[0];
                if (muniHit?.id != null) {
                    const municipality = municipalitiesByIdRef.current.get(String(muniHit.id));
                    if (municipality) {
                        callbacksRef.current.onMunicipalityClick?.(municipality);
                        return;
                    }
                }
            }
            callbacksRef.current.onSubjectSelect?.(null);
        };
        map.on('click', onClick);
        return () => {
            map.off('click', onClick);
        };
    }, [map, isLoaded, interactive]);
}
