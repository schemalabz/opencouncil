'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useTopics } from '@/hooks/useTopics';
import Map, { type MapFeature } from '@/components/map/map';
import { CategoryFilterBar } from '@/components/landing/v2/controls';
import { CoLocatedBox, GeneralSubjectsBox } from '@/components/landing/v2/mapMarkers';
import { SubjectList } from '@/components/landing/v2/SubjectList';
import { useFilteredSubjects } from '@/components/landing/v2/hooks/useFilteredSubjects';
import { useGeneralCityMarkers, useSubjectMarkers } from '@/components/landing/v2/hooks/useMapMarkers';
import { SubjectExpandedCard } from '@/components/map/subjects/SubjectExpandedCard';
import { SubjectStrip } from '@/components/map/subjects/SubjectStrip';
import { useSubjectMapState } from '@/components/map/subjects/useSubjectMapState';
import { EMPTY_FILTERS } from '@/lib/landing/landingCore';
import type { GeneralCityRow, MapSubject } from '@/lib/landing/landingData';
import { calculateGeometryBounds } from '@/lib/geo';

/**
 * A δήμος's subjects on the map — the landing map narrowed to one municipality.
 *
 * The pins, the co-located boxes and the mobile subject strip are the landing's own (see
 * components/map/subjects), so a subject reads and behaves the same wherever it is met. What the
 * landing carries and this does not: the δήμοι layers, the petition map, and the filter pane.
 * Narrowing beyond topics is the whole map's job — `moreHref` is the way there.
 */
export function CityMapTab({
    cityId,
    subjects,
    generalRows,
    geometry,
    moreHref,
}: {
    cityId: string;
    /** located subjects for this δήμος, server-loaded */
    subjects: MapSubject[];
    /** its non-located subjects, grouped (one city-hall marker) */
    generalRows: GeneralCityRow[];
    /** the δήμος boundary — frames the map and draws its outline */
    geometry: GeoJSON.Geometry | null;
    /** the whole map, already filtered to this δήμος: where date/body filtering lives */
    moreHref: string;
}) {
    const tc = useTranslations('City');
    const isMobile = useMediaQuery('(max-width: 1023px)');
    const { topics } = useTopics();
    const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
    const handleMapReady = useCallback((m: MapboxMap) => setMapInstance(m), []);
    const [cats, setCats] = useState<string[]>([]);
    // The general-city markers can close an OpenCouncil badge popup; this map never opens one.
    const closeExplainPopupRef = useRef<(() => void) | null>(null);

    const { center } = useMemo(() => calculateGeometryBounds(geometry), [geometry]);

    const {
        selectedId,
        setSelectedId,
        previewId,
        mapView,
        mapZoom,
        coLocated,
        setCoLocated,
        generalBox,
        setGeneralBox,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        pendingGeneralRef,
        previewSubject,
    } = useSubjectMapState({ mapInstance, initialZoom: INITIAL_ZOOM });

    const { visibleSubjects, visibleGeneralCities, listSubjects, findSubject, selectedSubject } = useFilteredSubjects({
        mapSubjects: subjects,
        generalRows,
        cats,
        filters: EMPTY_FILTERS,
        addressPoint: null,
        mapView,
        mapZoom,
        selectedId,
        previewId,
    });

    // The δήμος's own boundary, in the brand outline the landing gives a covered municipality.
    const features = useMemo<MapFeature[]>(
        () =>
            geometry
                ? [
                      {
                          id: `__city__${cityId}`,
                          geometry,
                          properties: { featureType: 'city', interactive: false },
                          style: {
                              fillColor: 'hsl(24, 100%, 50%)',
                              fillOpacity: 0.04,
                              strokeColor: 'hsl(24, 100%, 50%)',
                              strokeWidth: 1.5,
                              strokeOpacity: 0.9,
                          },
                      },
                  ]
                : [],
        [cityId, geometry],
    );

    const clearSelection = useCallback(() => setSelectedId(null), [setSelectedId]);

    // A pin tap previews on a phone (highlight + centre, no card) and opens the card on a desktop,
    // where the list beside the map is what a selection scrolls to.
    const onMarkerSelect = useCallback(
        (id: string) => {
            if (isMobile) previewSubject(findSubject(id));
            else setSelectedId(id);
        },
        [isMobile, previewSubject, findSubject, setSelectedId],
    );

    useSubjectMarkers({
        mapInstance,
        active: true,
        visibleSubjects,
        selectedId,
        previewId,
        onSelect: onMarkerSelect,
        onClearSelection: clearSelection,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        setCoLocated,
    });

    useGeneralCityMarkers({
        mapInstance,
        active: true,
        visibleGeneralCities,
        isMobile,
        onClearSelection: clearSelection,
        // No OpenCouncil badge and no out-of-network shading on a δήμος's own map: both are
        // answers to "which municipalities are covered", which this page has already answered.
        closeExplainPopupRef,
        suppressViewCaptureRef,
        pendingGeneralRef,
        setExplainOpen: noop,
        setClickedMunicipality: noop,
        setCoLocated,
        setGeneralBox,
    });

    return (
        <div className="space-y-3">
            <CategoryFilterBar topics={topics} selected={cats} onToggle={toggleIn(setCats)} onClear={() => setCats([])} />

            {/* Full-bleed on a phone, and tall enough that reaching it hands the screen to the map.
                A card inside the page's padding on a desktop, where the panel sits over it. */}
            <div className="relative -mx-4 h-[78dvh] min-h-[460px] overflow-hidden border-y border-border md:mx-0 md:rounded-[10px] md:border lg:h-[70dvh]">
                <Map
                    className="absolute inset-0 h-full w-full"
                    center={center}
                    zoom={INITIAL_ZOOM}
                    pitch={0}
                    animateRotation={false}
                    features={features}
                    onMapReady={handleMapReady}
                    zoomToGeometry={geometry}
                    zoomPadding={isMobile ? 24 : 48}
                    // The map sits in a scrolling page, so a plain wheel scrolls past it; zooming
                    // asks for ⌘/ctrl (and two fingers on a phone).
                    cooperativeGestures
                />

                {/* desktop: the subject list floats over the map, as on the landing */}
                <div className="pointer-events-none absolute inset-y-4 left-4 hidden w-[340px] lg:block">
                    <div className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-lg">
                        <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
                            <h2 className="text-sm font-bold">{tc('mapSubjectsHeading')}</h2>
                            <span className="text-sm text-muted-foreground">({listSubjects.length})</span>
                        </div>
                        <SubjectList
                            subjects={listSubjects}
                            selectedId={selectedId}
                            onSelect={setSelectedId}
                            loading={false}
                            variant="desktop"
                        />
                    </div>
                </div>

                {coLocated && (
                    <CoLocatedBox
                        data={coLocated}
                        onSelect={(id) => {
                            onMarkerSelect(id);
                            setCoLocated(null);
                        }}
                        onClose={() => setCoLocated(null)}
                    />
                )}
                {generalBox && (
                    <GeneralSubjectsBox
                        data={generalBox}
                        onSelect={(id) => {
                            onMarkerSelect(id);
                            setGeneralBox(null);
                        }}
                        onClose={() => setGeneralBox(null)}
                    />
                )}

                {/* phone: the strip of subject cards over the map — or the opened one over it */}
                <div className="lg:hidden">
                    {selectedSubject ? (
                        <SubjectExpandedCard
                            subject={selectedSubject}
                            openSource="city_map"
                            onClose={() => {
                                const s = selectedSubject;
                                clearSelection();
                                previewSubject(s);
                            }}
                        />
                    ) : (
                        <div className="absolute inset-x-0 bottom-3">
                            <SubjectStrip
                                subjects={listSubjects}
                                previewId={previewId}
                                onPreview={(id) => previewSubject(id ? findSubject(id) : null)}
                                onSelect={setSelectedId}
                            />
                        </div>
                    )}
                </div>
            </div>

            <p className="text-sm text-muted-foreground">
                <Link href={moreHref} className="inline-flex items-center gap-1 font-medium hover:underline">
                    {tc('mapSeeWholeMap')}
                    <ArrowUpRight className="h-4 w-4" />
                </Link>
            </p>
        </div>
    );
}

/** Where the map opens before the boundary fit takes over — δήμος-sized, so the fit is a nudge. */
const INITIAL_ZOOM = 12;
const noop = () => {};

/** Toggle an id in a string-array state setter. */
const toggleIn = (set: (fn: (prev: string[]) => string[]) => void) => (id: string) =>
    set((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
