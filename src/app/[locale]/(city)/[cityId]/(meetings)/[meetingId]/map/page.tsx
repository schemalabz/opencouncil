"use client"

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import CivicMap from '@/components/map/civic/CivicMap';
import type { CivicMapHandle } from '@/components/map/civic/types';
import { MapPanel, MOBILE_SNAP_POINTS } from '@/components/map/civic/panel/MapPanel';
import { SubjectsTab, type SubjectsSort } from '@/components/map/civic/panel/SubjectsTab';
import { subjectWithRelationsToMapSubject } from '@/lib/map/adapters';
import type { MapSubject } from '@/lib/map/types';

export default function MeetingMapPage() {
    const { city, meeting, subjects } = useCouncilMeetingData();
    const t = useTranslations('map');
    const isDesktop = useMediaQuery('(min-width: 768px)');

    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [hoveredSubjectId, setHoveredSubjectId] = useState<string | null>(null);
    const [visibleIds, setVisibleIds] = useState<Set<string> | null>(null);
    const [sort, setSort] = useState<SubjectsSort>('discussion');
    const [snap, setSnap] = useState<number | string | null>(MOBILE_SNAP_POINTS[0]);
    const mapHandleRef = useRef<CivicMapHandle | null>(null);

    const mapSubjects = useMemo(
        () => subjects
            .map(subject => subjectWithRelationsToMapSubject(subject, {
                cityName: city.name,
                meetingDate: meeting.dateTime,
                meetingName: meeting.name,
            }))
            .filter((subject): subject is MapSubject => subject !== null),
        [subjects, city.name, meeting.dateTime, meeting.name],
    );

    const visibleSubjects = useMemo(
        () => (visibleIds === null ? mapSubjects : mapSubjects.filter(subject => visibleIds.has(subject.id))),
        [mapSubjects, visibleIds],
    );
    const sortedSubjects = useMemo(() => {
        const list = [...visibleSubjects];
        if (sort === 'discussion') {
            list.sort((a, b) => b.discussionTimeSeconds - a.discussionTimeSeconds);
        } else {
            list.sort((a, b) => (b.meetingDate ?? '').localeCompare(a.meetingDate ?? ''));
        }
        return list;
    }, [visibleSubjects, sort]);

    const handleSelect = (subject: MapSubject | null) => {
        setSelectedSubjectId(subject?.id ?? null);
        if (subject && !isDesktop && snap === MOBILE_SNAP_POINTS[0]) {
            setSnap(MOBILE_SNAP_POINTS[1]);
        }
    };

    return (
        <div className="absolute inset-0 flex">
            <div className="relative min-w-0 flex-1">
                <CivicMap
                    className="h-full w-full"
                    subjects={mapSubjects}
                    contextBoundary={city.geometry ?? null}
                    markerOptions={{ clusterRadius: 45 }}
                    camera={{ fitTo: mapSubjects.length > 0 ? 'subjects' : city.geometry ?? null, padding: 80 }}
                    selectedSubjectId={selectedSubjectId}
                    hoveredSubjectId={hoveredSubjectId}
                    onSubjectSelect={handleSelect}
                    onVisibleSubjectsChange={ids => setVisibleIds(new Set(ids))}
                    onMapReady={controls => {
                        mapHandleRef.current = controls;
                    }}
                    ariaLabel={t('mapAria')}
                    labels={{ clusterAria: count => t('clusterAria', { count }) }}
                />
            </div>

            <MapPanel
                isDesktop={isDesktop}
                activeTab="subjects"
                onTabChange={() => undefined}
                availableTabs={['subjects']}
                summary={t('subjectsInView', { count: visibleSubjects.length })}
                snap={snap}
                onSnapChange={setSnap}
            >
                <SubjectsTab
                    subjects={sortedSubjects}
                    totalCount={visibleSubjects.length}
                    sort={sort}
                    onSortChange={setSort}
                    selectedSubjectId={selectedSubjectId}
                    onSelect={handleSelect}
                    onHover={setHoveredSubjectId}
                    filtersActive={false}
                    onClearFilters={() => undefined}
                    onZoomOut={() => mapHandleRef.current?.zoomBy(-2)}
                    showCount={isDesktop}
                />
            </MapPanel>
        </div>
    );
}
