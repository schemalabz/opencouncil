'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { ArrowUpRight, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useMediaQuery } from '@/hooks/use-media-query';
import Map, { type MapFeature } from '@/components/map/map';
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
    // The split is xl, not lg: this map sits in a column the city rail already narrows, so a
    // floating panel at 1024px would leave less map than list. Below xl the strip has the map.
    const isMobile = useMediaQuery('(max-width: 1279px)');
    const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
    const handleMapReady = useCallback((m: MapboxMap) => setMapInstance(m), []);
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
        cats: NO_CATS,
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
        // One object: the way out of this map, then the map. The card owns the height so the map
        // takes whatever the band above it leaves. Full-bleed on a phone, where the page's own
        // padding would only shrink the map.
        <div className="-mx-4 flex h-[82dvh] min-h-[520px] flex-col overflow-hidden border-y border-border bg-card md:mx-0 md:rounded-[10px] md:border lg:h-[76dvh]">
            {/* The whole band is the way out. This map is one δήμος; the full one carries every
                other δήμος and the date/body filters, so the card opens by pointing at it. */}
            <Link
                href={moreHref}
                className="group flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3 no-underline transition-colors hover:bg-[hsl(var(--orange-deep))]/[0.07] hover:no-underline"
            >
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[hsl(var(--orange-deep))]">
                    <Globe className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tc('mapOpenFullMap')}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-[hsl(var(--orange-deep))] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>

            <div className="flex min-h-0 flex-1">
                {/* Wide: the list is a column of the card, not a card floating on the map. The
                    landing floats it because the map is the whole window there; here the map is
                    already inside a card, and a card over a card over the page reads as clutter. */}
                <aside className="hidden w-[320px] shrink-0 flex-col border-r border-border xl:flex">
                    <div className="flex shrink-0 items-baseline gap-2 border-b border-border px-4 py-3">
                        <h2 className="text-sm font-bold">{tc('mapSubjectsHeading')}</h2>
                        <span className="text-sm text-muted-foreground">({listSubjects.length})</span>
                    </div>
                    <SubjectList
                        subjects={listSubjects}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        loading={false}
                        // 'mobile' is the untinted variant. The column's own border already parts it
                        // from the map, so the panel ground the landing needs would only add a layer.
                        variant="mobile"
                    />
                </aside>

                <div className="relative min-w-0 flex-1">
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

                    {/* narrow: the strip of subject cards over the map — or the opened one over it */}
                    <div className="xl:hidden">
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
            </div>
        </div>
    );
}

/** Where the map opens before the boundary fit takes over — δήμος-sized, so the fit is a nudge. */
const INITIAL_ZOOM = 12;
const noop = () => {};

/** Topics are not filtered here (that is the full map's job). Module-level so the identity is
 *  stable — a fresh [] each render would rebuild every marker on the map. */
const NO_CATS: string[] = [];
