'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useMapViewCapture } from '@/components/landing/v2/hooks/useMapMarkers';
import { SUBJECT_FOCUS_ZOOM } from '@/lib/landing/landingCore';
import {
    isValidLngLat,
    type CenterMunicipality,
    type CoLocatedBox,
    type GeneralBox,
    type LandingGeneralCity,
    type LandingSubject,
    type MapViewport,
} from '@/lib/landing/landingData';

export type SubjectMapState = {
    /** the opened subject — its preview/tooltip is showing */
    selectedId: string | null;
    setSelectedId: (v: string | null) => void;
    /** the strip's in-view subject — its pin gets the intense preview style */
    previewId: string | null;
    setPreviewId: (v: string | null) => void;
    /** captured on moveend — drives the in-view list */
    mapView: MapViewport | null;
    mapZoom: number;
    /** subjects at one point + screen position */
    coLocated: CoLocatedBox | null;
    setCoLocated: (v: CoLocatedBox | null) => void;
    /** a municipality's non-located subjects + screen position */
    generalBox: GeneralBox | null;
    setGeneralBox: (v: GeneralBox | null) => void;
    /** the municipality under the map center — null unless `trackCenterMunicipality` is on */
    centerMunicipality: CenterMunicipality | null;
    /** set before a programmatic pan so the next moveend doesn't refilter the list */
    suppressViewCaptureRef: MutableRefObject<boolean>;
    pendingCoLocatedRef: MutableRefObject<LandingSubject[] | null>;
    pendingGeneralRef: MutableRefObject<LandingGeneralCity | null>;
    /** highlight a subject and navigate the map to it, without opening its box */
    previewSubject: (subject: LandingSubject | null) => void;
};

/**
 * The state every subject map keeps: what is selected, what the strip is previewing, where the
 * viewport is, and which cluster box is open — plus the moveend capture that feeds them.
 *
 * Shared by the landing (all of Greece, with its municipality layers on top) and a city page's map
 * tab (one δήμος, subject pins only). What differs between the two — which marker layers are
 * active, what a selection is tracked as — stays with the caller.
 */
export function useSubjectMapState({
    mapInstance,
    initialZoom,
    trackCenterMunicipality = false,
    onUserNavigate,
}: {
    mapInstance: MapboxMap | null;
    initialZoom: number;
    /** Resolve the δήμος under the map center on every move (one /api/cities/at call per
     *  meaningful pan). Only the landing needs it — a city map already knows its δήμος. */
    trackCenterMunicipality?: boolean;
    /** extra work on a genuine user pan/zoom, not on a suppressed programmatic move. The preview
     *  is dropped either way — navigating away from it must not snap the map back. */
    onUserNavigate?: () => void;
}): SubjectMapState {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [mapView, setMapView] = useState<MapViewport | null>(null);
    const [mapZoom, setMapZoom] = useState(initialZoom);
    const [coLocated, setCoLocated] = useState<CoLocatedBox | null>(null);
    const [generalBox, setGeneralBox] = useState<GeneralBox | null>(null);
    const [centerMunicipality, setCenterMunicipality] = useState<CenterMunicipality | null>(null);

    const suppressViewCaptureRef = useRef(false);
    const pendingCoLocatedRef = useRef<LandingSubject[] | null>(null);
    const pendingGeneralRef = useRef<LandingGeneralCity | null>(null);

    useMapViewCapture({
        mapInstance,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        pendingGeneralRef,
        setMapZoom,
        setCenterMunicipality: trackCenterMunicipality ? setCenterMunicipality : undefined,
        setCoLocated,
        setGeneralBox,
        setMapView,
        onUserNavigate: () => {
            setPreviewId(null);
            onUserNavigate?.();
        },
    });

    // Preview: highlight the pin and navigate to it (like a selection, but no box). The pan is
    // suppressed so the moveend neither refilters the list nor clears the preview.
    const previewSubject = useCallback(
        (subject: LandingSubject | null) => {
            setPreviewId(subject?.id ?? null);
            if (!subject || !mapInstance || !isValidLngLat(subject.lng, subject.lat)) return;
            suppressViewCaptureRef.current = true;
            mapInstance.easeTo({
                center: [subject.lng, subject.lat],
                zoom: Math.max(mapInstance.getZoom(), SUBJECT_FOCUS_ZOOM),
                duration: 500,
            });
        },
        [mapInstance],
    );

    return {
        selectedId,
        setSelectedId,
        previewId,
        setPreviewId,
        mapView,
        mapZoom,
        coLocated,
        setCoLocated,
        generalBox,
        setGeneralBox,
        centerMunicipality,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        pendingGeneralRef,
        previewSubject,
    };
}
