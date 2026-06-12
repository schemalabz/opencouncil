"use client"

import { useEffect, useMemo, useRef, useState } from 'react';
import { Filter, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Topic } from '@prisma/client';
import { cn } from '@/lib/utils';
import { calculateGeometryBounds } from '@/lib/geo';
import { useMediaQuery } from '@/hooks/use-media-query';
import { apiSubjectToMapSubject } from '@/lib/map/adapters';
import {
    DEFAULT_MAP_FILTER,
    hasNarrowingFilters,
    isDefaultFilter,
    mapFilterToApiQuery,
    mapFilterToSearchParams,
    type MapFilterState,
} from '@/lib/map/params';
import type { MapMunicipality, MapSubject, MapSubjectsApiItem } from '@/lib/map/types';
import type { ViewportBounds } from '@/lib/map/viewport';
import CivicMap from './civic/CivicMap';
import type { CivicMapHandle } from './civic/types';
import { MapPanel, MOBILE_SNAP_POINTS, type PanelTab } from './civic/panel/MapPanel';
import { SubjectsTab } from './civic/panel/SubjectsTab';
import { MunicipalitiesTab } from './civic/panel/MunicipalitiesTab';
import { MunicipalityDetail } from './civic/panel/MunicipalityDetail';
import { TimeFilter } from './civic/panel/TimeFilter';
import { MapSearch } from './civic/panel/MapSearch';
import { FilterPane } from './civic/panel/FilterPane';
import { ActiveFilterChips } from './civic/panel/ActiveFilterChips';
import { GeolocateButton } from './civic/panel/GeolocateButton';

interface MapPageViewProps {
    topics: Topic[];
    municipalities: MapMunicipality[];
    initialSubjects: MapSubject[];
    initialFilter: MapFilterState;
}

export default function MapPageView({ topics, municipalities, initialSubjects, initialFilter }: MapPageViewProps) {
    const t = useTranslations('map');
    const isDesktop = useMediaQuery('(min-width: 768px)');

    const [filter, setFilter] = useState<MapFilterState>(initialFilter);
    const [subjects, setSubjects] = useState<MapSubject[]>(initialSubjects);
    const [isUpdating, setIsUpdating] = useState(false);
    const [fetchFailed, setFetchFailed] = useState(false);
    const [retryNonce, setRetryNonce] = useState(0);

    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [hoveredSubjectId, setHoveredSubjectId] = useState<string | null>(null);
    const [visibleIds, setVisibleIds] = useState<Set<string> | null>(null);
    const [bounds, setBounds] = useState<ViewportBounds | null>(null);
    const [spiderfiedIds, setSpiderfiedIds] = useState<string[] | null>(null);
    const [activeTab, setActiveTab] = useState<PanelTab>('subjects');
    const [municipalityDetail, setMunicipalityDetail] = useState<MapMunicipality | null>(null);
    const [highlightPoint, setHighlightPoint] = useState<[number, number] | null>(null);
    const [snap, setSnap] = useState<number | string | null>(MOBILE_SNAP_POINTS[0]);
    const [isFilterPaneOpen, setFilterPaneOpen] = useState(false);
    const mapHandleRef = useRef<CivicMapHandle | null>(null);

    const supportedMunicipalities = useMemo(
        () => municipalities.filter(municipality => municipality.officialSupport),
        [municipalities],
    );

    // Refetch on filter change (the server shell provided the initial set).
    const isInitialFilter = useRef(true);
    useEffect(() => {
        if (isInitialFilter.current) {
            isInitialFilter.current = false;
            return;
        }
        const controller = new AbortController();
        setIsUpdating(true);
        setFetchFailed(false);
        fetch(`/api/map/subjects?${mapFilterToApiQuery(filter)}`, { signal: controller.signal })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((items: MapSubjectsApiItem[]) => {
                setSubjects(items.map(apiSubjectToMapSubject));
                setIsUpdating(false);
            })
            .catch(() => {
                if (controller.signal.aborted) return;
                setIsUpdating(false);
                setFetchFailed(true);
            });

        // Shareable URL without a server round-trip; the camera hash stays.
        const query = mapFilterToSearchParams(filter).toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);

        return () => controller.abort();
    }, [filter, retryNonce]);

    // Escape clears the selection
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedSubjectId(null);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Programmatic camera moves account for the chrome: the drawer on
    // mobile, the floating controls everywhere.
    useEffect(() => {
        const handle = mapHandleRef.current;
        if (!handle) return;
        if (isDesktop) {
            handle.setPadding({ top: 140, left: 48, right: 48, bottom: 64 });
        } else {
            const drawerCovers = snap === MOBILE_SNAP_POINTS[0]
                ? 160
                : Math.round(window.innerHeight * 0.5) + 24;
            handle.setPadding({ top: 120, left: 32, right: 32, bottom: drawerCovers });
        }
    }, [isDesktop, snap]);

    const visibleSubjects = useMemo(
        () => (visibleIds === null ? subjects : subjects.filter(subject => visibleIds.has(subject.id))),
        [subjects, visibleIds],
    );
    // While a spiderfy fan is open, the list scopes to exactly its subjects.
    const spiderfiedSubjects = useMemo(() => {
        if (!spiderfiedIds) return null;
        const byId = new Map(subjects.map(subject => [subject.id, subject]));
        return spiderfiedIds
            .map(id => byId.get(id))
            .filter((subject): subject is MapSubject => Boolean(subject));
    }, [spiderfiedIds, subjects]);
    const listSubjects = useMemo(() => {
        const base = spiderfiedSubjects ?? visibleSubjects;
        return [...base].sort((a, b) => b.discussionTimeSeconds - a.discussionTimeSeconds);
    }, [spiderfiedSubjects, visibleSubjects]);

    const subjectCountByCity = useMemo(() => {
        const counts = new Map<string, number>();
        for (const subject of subjects) {
            counts.set(subject.cityId, (counts.get(subject.cityId) ?? 0) + 1);
        }
        return counts;
    }, [subjects]);

    const municipalityBBoxes = useMemo(() => {
        const boxes = new Map<string, { minLng: number; maxLng: number; minLat: number; maxLat: number }>();
        for (const municipality of municipalities) {
            if (municipality.geometry) {
                const { bounds: box } = calculateGeometryBounds(municipality.geometry);
                if (box) boxes.set(municipality.id, box);
            }
        }
        return boxes;
    }, [municipalities]);
    // BBox overlap, not center-in-view: zoomed deep inside a city, its
    // center is off-screen but the city is very much "in view".
    const municipalitiesInView = useMemo(() => {
        if (!bounds) return municipalities;
        return municipalities.filter(municipality => {
            const box = municipalityBBoxes.get(municipality.id);
            if (!box) return false;
            return box.maxLng >= bounds.west && box.minLng <= bounds.east &&
                box.maxLat >= bounds.south && box.minLat <= bounds.north;
        });
    }, [municipalities, municipalityBBoxes, bounds]);

    const filtersActive = !isDefaultFilter(filter);
    const activeFilterCount =
        (filter.topicIds?.length ?? 0) +
        (filter.cityIds?.length ?? 0) +
        (filter.bodyTypes?.length ?? 0) +
        (filter.dateFrom || filter.dateTo ? 1 : 0);

    const handleSubjectSelect = (subject: MapSubject | null) => {
        setSelectedSubjectId(subject?.id ?? null);
        if (subject) {
            setActiveTab('subjects');
            if (!isDesktop && snap === MOBILE_SNAP_POINTS[0]) setSnap(MOBILE_SNAP_POINTS[1]);
        }
    };

    const handleMunicipalityOpen = (municipality: MapMunicipality) => {
        if (municipality.geometry) {
            mapHandleRef.current?.fitGeometry(municipality.geometry);
        }
        setMunicipalityDetail(municipality);
    };

    const summary = spiderfiedSubjects
        ? t('subjectsAtPoint', { count: spiderfiedSubjects.length })
        : t('subjectsInView', { count: visibleSubjects.length });

    return (
        <div className="flex h-full w-full">
            <a
                href="#map-panel"
                className="sr-only z-20 bg-background px-3 py-2 text-sm shadow-md focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
            >
                {t('skipToList')}
            </a>

            <div className="relative min-w-0 flex-1">
                <CivicMap
                    className="h-full w-full"
                    subjects={subjects}
                    municipalities={municipalities}
                    camera={{ fitTo: 'subjects', urlHash: true }}
                    selectedSubjectId={selectedSubjectId}
                    hoveredSubjectId={hoveredSubjectId}
                    onSubjectSelect={handleSubjectSelect}
                    onMunicipalityClick={setMunicipalityDetail}
                    onVisibleSubjectsChange={ids => setVisibleIds(new Set(ids))}
                    onSpiderfyChange={setSpiderfiedIds}
                    onMoveEnd={view => setBounds(view.bounds)}
                    onMapReady={controls => {
                        mapHandleRef.current = controls;
                    }}
                    highlightPoint={highlightPoint}
                    ariaLabel={t('mapAria')}
                    labels={{ clusterAria: count => t('clusterAria', { count }) }}
                >
                    <div className="absolute left-3 right-3 top-3 flex flex-col gap-2 md:left-4 md:right-4 md:top-4">
                        <div className="flex items-center gap-2">
                            <MapSearch
                                topics={topics}
                                municipalities={supportedMunicipalities}
                                onTopicSelect={topicId => setFilter(prev => ({
                                    ...prev,
                                    topicIds: prev.topicIds?.includes(topicId)
                                        ? prev.topicIds
                                        : [...(prev.topicIds ?? []), topicId],
                                }))}
                                onMunicipalitySelect={municipality => {
                                    if (municipality.geometry) mapHandleRef.current?.fitGeometry(municipality.geometry);
                                }}
                                onLocationSelect={(coordinates) => {
                                    setHighlightPoint(coordinates);
                                    mapHandleRef.current?.flyTo(coordinates, 15);
                                }}
                                onClear={() => setHighlightPoint(null)}
                            />
                            {isDesktop && (
                                <TimeFilter
                                    monthsBack={filter.dateFrom || filter.dateTo ? null : filter.monthsBack}
                                    onChange={monthsBack => setFilter(prev => ({ ...prev, monthsBack, dateFrom: null, dateTo: null }))}
                                />
                            )}
                            <button
                                type="button"
                                aria-label={t('filtersTitle')}
                                aria-pressed={isFilterPaneOpen}
                                onClick={() => setFilterPaneOpen(true)}
                                className="relative flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-background shadow-md transition-colors hover:bg-muted"
                            >
                                <Filter className="h-4 w-4 text-foreground" />
                                {activeFilterCount > 0 && (
                                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(24,100%,50%)] px-1 text-[10px] font-semibold leading-none text-white">
                                        {activeFilterCount}
                                    </span>
                                )}
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isDesktop && (
                                <TimeFilter
                                    monthsBack={filter.dateFrom || filter.dateTo ? null : filter.monthsBack}
                                    onChange={monthsBack => setFilter(prev => ({ ...prev, monthsBack, dateFrom: null, dateTo: null }))}
                                />
                            )}
                            <ActiveFilterChips
                                className="min-w-0 flex-1"
                                filter={filter}
                                topics={topics}
                                municipalities={supportedMunicipalities}
                                onFilterChange={setFilter}
                            />
                        </div>
                    </div>

                    <GeolocateButton
                        compact={!isDesktop}
                        className={cn('absolute', isDesktop ? 'bottom-6 right-4' : 'bottom-[150px] right-3')}
                        onLocated={coordinates => {
                            setHighlightPoint(coordinates);
                            mapHandleRef.current?.flyTo(coordinates, 14);
                        }}
                    />

                    {isUpdating && (
                        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-md">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t('updating')}
                        </div>
                    )}
                </CivicMap>
            </div>

            <MapPanel
                isDesktop={isDesktop}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                summary={summary}
                snap={snap}
                onSnapChange={setSnap}
            >
                {activeTab === 'subjects' ? (
                    <SubjectsTab
                        subjects={listSubjects}
                        totalCount={listSubjects.length}
                        selectedSubjectId={selectedSubjectId}
                        onSelect={handleSubjectSelect}
                        onHover={setHoveredSubjectId}
                        filtersActive={filtersActive}
                        onClearFilters={() => setFilter(DEFAULT_MAP_FILTER)}
                        onZoomOut={() => mapHandleRef.current?.zoomBy(-2)}
                        error={fetchFailed}
                        onRetry={() => setRetryNonce(nonce => nonce + 1)}
                        showCount={isDesktop}
                        headerText={spiderfiedSubjects ? t('subjectsAtPoint', { count: spiderfiedSubjects.length }) : undefined}
                    />
                ) : (
                    <MunicipalitiesTab
                        municipalities={municipalitiesInView}
                        subjectCountByCity={subjectCountByCity}
                        onMunicipalityClick={handleMunicipalityOpen}
                        onRequestCity={setMunicipalityDetail}
                    />
                )}
            </MapPanel>

            <MunicipalityDetail
                municipality={municipalityDetail}
                onOpenChange={open => {
                    if (!open) setMunicipalityDetail(null);
                }}
            />

            <FilterPane
                open={isFilterPaneOpen}
                onOpenChange={setFilterPaneOpen}
                topics={topics}
                municipalities={supportedMunicipalities}
                filter={filter}
                onFilterChange={setFilter}
            />
        </div>
    );
}
