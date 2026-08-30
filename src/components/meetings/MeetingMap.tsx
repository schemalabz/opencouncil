'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useTranslations } from 'next-intl';
import Map, { type MapFeature } from '@/components/map/map';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { CoLocatedBox } from '@/components/landing/v2/mapMarkers';
import { SubjectList } from '@/components/landing/v2/SubjectList';
import { useFilteredSubjects } from '@/components/landing/v2/hooks/useFilteredSubjects';
import { useSubjectMarkers } from '@/components/landing/v2/hooks/useMapMarkers';
import { SubjectExpandedCard } from '@/components/map/subjects/SubjectExpandedCard';
import { SubjectStrip } from '@/components/map/subjects/SubjectStrip';
import { useSubjectMapState } from '@/components/map/subjects/useSubjectMapState';
import { useMediaQuery } from '@/hooks/use-media-query';
import { EMPTY_FILTERS } from '@/lib/landing/landingCore';
import type { MapSubject } from '@/lib/landing/landingData';
import { getRealmDefaultMapView } from '@/lib/realm';

/**
 * The meeting's subjects on the map — the same subject layer the landing and
 * the city page's map tab run, fed entirely from the meeting data the shell has
 * already loaded: no fetch of its own, and none of the landing's extra layers
 * (δήμοι donuts, petitions, filters). This replaces the page's bespoke map,
 * whose flat dots navigated away on click; a pin now behaves as it does
 * everywhere else — preview on a phone, an opening card on a desktop.
 */
export function MeetingMap() {
    const { city, meeting, subjects } = useCouncilMeetingData();
    const tc = useTranslations('City');
    const isMobile = useMediaQuery('(max-width: 1023px)');
    const [mapInstance, setMapInstance] = useState<MapboxMap | null>(null);
    const handleMapReady = useCallback((m: MapboxMap) => setMapInstance(m), []);

    // When the city has no stored geometry, fall back to its realm's centre so
    // the map doesn't default to Greece — carried over from the bespoke map.
    const fallbackView = getRealmDefaultMapView(city.realm);

    // The meeting's located subjects in the map's wire shape — the same rows the
    // landing's endpoints serve, built purely from context data the page already
    // holds, so this map costs no request of its own.
    const mapSubjects = useMemo<MapSubject[]>(() =>
        subjects.flatMap(subject => {
            const point = subject.location?.coordinates;
            if (!point) return [];
            return [{
                id: subject.id,
                name: subject.name,
                description: subject.description ?? '',
                cityId: city.id,
                cityName: city.name,
                cityTimezone: city.timezone,
                nameMunicipality: city.name_municipality,
                logoImage: city.logoImage,
                councilMeetingId: meeting.id,
                meetingDate: new Date(meeting.dateTime).toISOString(),
                meetingName: meeting.name,
                bodyName: meeting.administrativeBody?.name ?? null,
                adminBodyType: meeting.administrativeBody?.type ?? null,
                locationText: subject.location?.text ?? undefined,
                topicId: subject.topicId,
                topicName: subject.topic?.name,
                topicColor: subject.topic?.colorHex ?? '#9ca3af',
                topicIcon: subject.topic?.icon ?? null,
                discussionTimeSeconds: subject.statistics?.speakingSeconds ?? 0,
                speakerCount: subject.statistics?.people?.length ?? 0,
                geometry: { type: 'Point', coordinates: [point.x, point.y] },
            }];
        }),
        [subjects, city, meeting],
    );

    const {
        selectedId,
        setSelectedId,
        previewId,
        mapView,
        mapZoom,
        coLocated,
        setCoLocated,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        previewSubject,
    } = useSubjectMapState({ mapInstance, initialZoom: fallbackView.zoom });

    const { visibleSubjects, listSubjects, findSubject, selectedSubject } = useFilteredSubjects({
        mapSubjects,
        generalRows: [],
        cats: NO_CATS,
        filters: EMPTY_FILTERS,
        addressPoint: null,
        mapView,
        mapZoom,
        selectedId,
        previewId,
    });

    const clearSelection = useCallback(() => setSelectedId(null), [setSelectedId]);
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

    // The δήμος boundary, in the outline the subject maps share.
    const features = useMemo<MapFeature[]>(() =>
        city.geometry
            ? [{
                id: `__city__${city.id}`,
                geometry: city.geometry,
                properties: { featureType: 'city', interactive: false },
                style: {
                    fillColor: 'hsl(24, 100%, 50%)',
                    fillOpacity: 0.04,
                    strokeColor: 'hsl(24, 100%, 50%)',
                    strokeWidth: 1.5,
                    strokeOpacity: 0.9,
                },
            }]
            : [],
        [city.id, city.geometry],
    );

    return (
        <div className="absolute inset-0">
            <Map
                className="h-full w-full"
                features={features}
                center={city.geometry ? undefined : fallbackView.center}
                zoom={city.geometry ? undefined : fallbackView.zoom}
                animateRotation={false}
                zoomToGeometry={city.geometry}
                zoomPadding={isMobile ? 40 : 120}
                onMapReady={handleMapReady}
            />

            {/* desktop: the floating subject list, as on the landing */}
            <div className="pointer-events-none absolute bottom-4 left-4 top-4 hidden w-[320px] lg:block">
                <div className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
                    <div className="flex shrink-0 items-baseline gap-2 border-b border-border px-4 py-3">
                        <h2 className="!m-0 !text-left text-sm font-bold">{tc('mapSubjectsHeading')}</h2>
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

            {/* phone: the strip of subject cards over the map — or the opened one */}
            <div className="lg:hidden">
                {selectedSubject ? (
                    <SubjectExpandedCard
                        subject={selectedSubject}
                        openSource="meeting_map"
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
    );
}

/** No topic filtering on a meeting's map. Module-level so the identity is stable —
 *  a fresh [] each render would rebuild every marker. */
const NO_CATS: string[] = [];
