'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useTranslations } from 'next-intl';
import Map, { type MapFeature } from '@/components/map/map';
import { cityBoundaryFeature } from '@/components/map/cityBoundary';
import { TOPICLESS_COLOR } from '@/lib/topicStyle';
import { captureEvent } from '@/lib/analytics/capture';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { CoLocatedBox } from '@/components/landing/v2/mapMarkers';
import { useSubjectMarkers } from '@/components/landing/v2/hooks/useMapMarkers';
import { useSubjectMapState } from '@/components/map/subjects/useSubjectMapState';
import { useMediaQuery } from '@/hooks/use-media-query';
import { toLandingSubjects, type MapSubject } from '@/lib/landing/landingData';
import { getRealmDefaultMapView } from '@/lib/realm';
import { useRouter } from '@/i18n/routing';

/**
 * The meeting's subjects on the map — the same pin layer the landing and the
 * city map run, fed entirely from the meeting data the shell already holds: no
 * fetch of its own, and none of the landing's extra layers. No list rides the
 * map either: zoomed in, the base map's collision-managed label layer sets each
 * subject's title beside its pin, and a click goes straight to the subject —
 * the map is an index here, not a reading surface.
 */
export function MeetingMap() {
    const { city, meeting, subjects } = useCouncilMeetingData();
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
                topicColor: subject.topic?.colorHex ?? TOPICLESS_COLOR,
                topicIcon: subject.topic?.icon ?? null,
                discussionTimeSeconds: subject.statistics?.speakingSeconds ?? 0,
                speakerCount: subject.statistics?.people?.length ?? 0,
                geometry: { type: 'Point', coordinates: [point.x, point.y] },
            }];
        }),
        [subjects, city, meeting],
    );

    const router = useRouter();
    const { setCoLocated, coLocated, suppressViewCaptureRef, pendingCoLocatedRef } =
        useSubjectMapState({ mapInstance, initialZoom: fallbackView.zoom, surface: 'meeting_map' });

    const t = useTranslations('landingV2');
    const landingSubjects = useMemo(
        () => toLandingSubjects(mapSubjects, t('topic.general')),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mapSubjects],
    );
    const open = useCallback(
        (id: string) => {
            const subject = landingSubjects.find(s => s.id === id);
            if (!subject) return;
            captureEvent('subject_opened', { surface: 'meeting_map', subject_id: id, city_id: city.id, meeting_id: meeting.id });
            router.push(subject.href);
        },
        [landingSubjects, router, city.id, meeting.id],
    );

    useSubjectMarkers({
        mapInstance,
        surface: 'meeting_map',
        active: true,
        visibleSubjects: landingSubjects,
        selectedId: null,
        previewId: null,
        onSelect: open,
        onClearSelection: NOOP,
        suppressViewCaptureRef,
        pendingCoLocatedRef,
        setCoLocated,
    });

    // The δήμος boundary in the shared outline, plus one invisible point per
    // subject whose only job is its `label`: the base map's symbol layer picks
    // those up past zoom 12 with collision handling, so titles appear exactly
    // when the pins have spread enough to own them.
    const features = useMemo<MapFeature[]>(() => [
        ...landingSubjects.map(subject => ({
            id: `label-${subject.id}`,
            geometry: { type: 'Point' as const, coordinates: [subject.lng, subject.lat] },
            properties: { interactive: false, labelAnchor: 'left' as const },
            style: {
                fillOpacity: 0,
                strokeWidth: 0,
                strokeOpacity: 0,
                label: subject.title,
            },
        })),
        ...(city.geometry ? [cityBoundaryFeature(`__city__${city.id}`, city.geometry)] : []),
    ], [city.id, city.geometry, landingSubjects]);

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

            {coLocated && (
                <CoLocatedBox
                    data={coLocated}
                    onSelect={open}
                    onClose={() => setCoLocated(null)}
                />
            )}
        </div>
    );
}

const NOOP = () => {};
