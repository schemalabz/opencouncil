import { useState, useEffect } from 'react';
import { MapFeature } from '@/components/map/map';
import {
    CityWithGeometryAndCounts,
    SubjectWithGeometry,
    MapFiltersState,
    MAP_HEATMAP_CONFIG
} from '@/types/map';

interface UseMapFeaturesProps {
    filters: MapFiltersState;
    allTopicsLoaded: boolean;
    allCitiesLoaded: boolean;
    filtersInitialized: boolean;
    onCitiesUpdate?: (cities: CityWithGeometryAndCounts[]) => void;
}

/**
 * Hook to fetch and transform map features based on filters
 * Handles request cancellation and loading states
 */
export function useMapFeatures({
    filters,
    allTopicsLoaded,
    allCitiesLoaded,
    filtersInitialized,
    onCitiesUpdate
}: UseMapFeaturesProps) {
    const [features, setFeatures] = useState<MapFeature[]>([]);
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Clear error when user changes filters (fresh attempt)
        setError(null);

        // Don't fetch until topics, cities, and filters are all initialized
        if (!allTopicsLoaded || !allCitiesLoaded || !filtersInitialized) {
            return;
        }

        const abortController = new AbortController();
        let isStale = false;

        async function loadFeatures() {
            try {
                setIsUpdating(true);

                // Build query params for subjects
                const topicIds = filters.selectedTopics?.map(t => t.id).join(',') || '';
                const cityIds = filters.selectedCities?.join(',') || '';
                const bodyTypes = filters.selectedBodyTypes?.join(',') || '';
                const longOnly = filters.longOnly || false;

                // Early exit only if ALL filters are cleared after initialization
                // This prevents hiding everything when just one category is empty
                const userHasClearedTopics = filtersInitialized && filters.selectedTopics?.length === 0;
                const userHasClearedCities = filtersInitialized && filters.selectedCities?.length === 0;
                const userHasClearedBodies = filtersInitialized && filters.selectedBodyTypes?.length === 0;

                if (userHasClearedTopics && userHasClearedCities && userHasClearedBodies) {
                    // We still fetch cities to show the polygons, but skip subject fetch
                    const citiesResponse = await fetch('/api/cities/map', {
                        cache: 'no-store',
                        signal: abortController.signal
                    });

                    if (isStale) return;

                    const cities: CityWithGeometryAndCounts[] = await citiesResponse.json();
                    onCitiesUpdate?.(cities);

                    const citiesWithGeometry = cities.filter(city => city.geometry);
                    const cityFeatures: MapFeature[] = citiesWithGeometry.map(city => {
                        const petitionCount = city._count?.petitions || 0;
                        const isSupported = city.officialSupport;

                        const blueOpacity = petitionCount > 0
                            ? Math.min(
                                MAP_HEATMAP_CONFIG.MAX_HEATMAP_OPACITY,
                                MAP_HEATMAP_CONFIG.MIN_HEATMAP_OPACITY +
                                (petitionCount / MAP_HEATMAP_CONFIG.PETITION_TARGET) *
                                MAP_HEATMAP_CONFIG.HEATMAP_OPACITY_RANGE
                            )
                            : 0;

                        return {
                            type: 'Feature',
                            id: city.id,
                            geometry: city.geometry!,
                            properties: {
                                name: city.name,
                                name_en: city.name_en,
                                cityId: city.id,
                                officialSupport: isSupported,
                                supportsNotifications: city.supportsNotifications,
                                logoImage: city.logoImage,
                                meetingsCount: city._count?.councilMeetings || 0,
                                petitionCount: petitionCount,
                                featureType: 'city'
                            },
                            style: {
                                fillColor: isSupported
                                    ? 'hsl(24, 100%, 92%)'
                                    : 'hsl(212, 100%, 45%)',
                                fillOpacity: isSupported ? 0.35 : blueOpacity,
                                strokeColor: isSupported
                                    ? 'hsl(24, 100%, 50%)'
                                    : 'hsl(212, 60%, 65%)',
                                strokeWidth: isSupported ? 1.5 : 0,
                                strokeOpacity: isSupported ? 0.6 : 0,
                            }
                        };
                    });

                    setFeatures(cityFeatures);
                    return;
                }

                let subjectsUrl = `/api/map/subjects?monthsBack=${filters.monthsBack}`;
                if (topicIds) subjectsUrl += `&topicIds=${topicIds}`;
                if (cityIds) subjectsUrl += `&cityIds=${cityIds}`;
                if (bodyTypes) subjectsUrl += `&bodyTypes=${bodyTypes}`;
                if (longOnly) subjectsUrl += `&longOnly=true`;

                // Fetch both cities and subjects in parallel
                const [citiesResponse, subjectsResponse] = await Promise.all([
                    fetch('/api/cities/map', {
                        cache: 'no-store',
                        signal: abortController.signal
                    }),
                    fetch(subjectsUrl, {
                        cache: 'no-store',
                        signal: abortController.signal
                    })
                ]);

                if (isStale) return;

                const cities: CityWithGeometryAndCounts[] = await citiesResponse.json();
                if (isStale) return;

                const subjects: SubjectWithGeometry[] = await subjectsResponse.json();
                if (isStale) return;

                // Notify parent of updated cities (for zoom functionality)
                onCitiesUpdate?.(cities);

                // Convert cities to map features
                const citiesWithGeometry = cities.filter(city => city.geometry);
                const cityFeatures: MapFeature[] = citiesWithGeometry.map(city => {
                    const petitionCount = city._count?.petitions || 0;
                    const isSupported = city.officialSupport;

                    // Heatmap logic for unsupported cities
                    const blueOpacity = petitionCount > 0
                        ? Math.min(
                            MAP_HEATMAP_CONFIG.MAX_HEATMAP_OPACITY,
                            MAP_HEATMAP_CONFIG.MIN_HEATMAP_OPACITY +
                            (petitionCount / MAP_HEATMAP_CONFIG.PETITION_TARGET) *
                            MAP_HEATMAP_CONFIG.HEATMAP_OPACITY_RANGE
                        )
                        : 0;

                    return {
                        type: 'Feature',
                        id: city.id,
                        geometry: city.geometry!,
                        properties: {
                            name: city.name,
                            name_en: city.name_en,
                            cityId: city.id,
                            officialSupport: isSupported,
                            supportsNotifications: city.supportsNotifications,
                            logoImage: city.logoImage,
                            meetingsCount: city._count?.councilMeetings || 0,
                            petitionCount: petitionCount,
                            featureType: 'city'
                        },
                        style: {
                            fillColor: isSupported
                                ? 'hsl(24, 100%, 92%)'
                                : 'hsl(212, 100%, 45%)',
                            fillOpacity: isSupported ? 0.35 : blueOpacity,
                            strokeColor: isSupported
                                ? 'hsl(24, 100%, 50%)'
                                : 'hsl(212, 60%, 65%)',
                            strokeWidth: isSupported ? 1.5 : 0,
                            strokeOpacity: isSupported ? 0.6 : 0,
                        }
                    };
                });

                // Calculate opacity based on recency
                const now = new Date();
                const periodInMs = filters.monthsBack * 30.44 * 24 * 60 * 60 * 1000;

                // Convert subjects to point features
                const subjectFeatures: MapFeature[] = subjects.map(subject => {
                    const correspondingCity = citiesWithGeometry.find(
                        city => city.id === subject.cityId
                    );

                    // Calculate opacity based on meeting age
                    let opacity = MAP_HEATMAP_CONFIG.DEFAULT_SUBJECT_OPACITY;
                    if (subject.meetingDate) {
                        const meetingDate = new Date(subject.meetingDate);
                        const ageInMs = now.getTime() - meetingDate.getTime();
                        const ageRatio = ageInMs / periodInMs;
                        opacity = Math.max(
                            MAP_HEATMAP_CONFIG.MIN_AGE_OPACITY,
                            Math.min(
                                MAP_HEATMAP_CONFIG.MAX_AGE_OPACITY,
                                MAP_HEATMAP_CONFIG.MAX_AGE_OPACITY -
                                (ageRatio * MAP_HEATMAP_CONFIG.AGE_OPACITY_DECAY)
                            )
                        );
                    }

                    return {
                        type: 'Feature',
                        id: `subject-${subject.id}`,
                        geometry: subject.geometry,
                        properties: {
                            name: subject.name,
                            description: subject.description,
                            subjectId: subject.id,
                            cityId: subject.cityId,
                            cityName: correspondingCity?.name,
                            councilMeetingId: subject.councilMeetingId,
                            locationText: subject.locationText,
                            topicName: subject.topicName,
                            topicColor: subject.topicColor,
                            topicIcon: subject.topicIcon,
                            meetingDate: subject.meetingDate,
                            meetingName: subject.meetingName,
                            discussionTimeSeconds: subject.discussionTimeSeconds,
                            speakerCount: subject.speakerCount,
                            featureType: 'subject'
                        },
                        style: {
                            fillColor: subject.topicColor,
                            fillOpacity: opacity,
                            strokeColor: subject.topicColor,
                            strokeWidth: 4,
                            strokeOpacity: 0,
                        }
                    };
                });

                setFeatures([...cityFeatures, ...subjectFeatures]);
            } catch (error) {
                if (error instanceof Error && error.name !== 'AbortError') {
                    console.error('Error loading cities:', error);
                    if (!isStale) {
                        setError('Αποτυχία φόρτωσης δεδομένων χάρτη');
                        setFeatures([]);
                    }
                }
            } finally {
                if (!isStale) {
                    setIsUpdating(false);
                }
            }
        }

        loadFeatures();

        return () => {
            isStale = true;
            abortController.abort();
        };
    }, [filters, allTopicsLoaded, allCitiesLoaded, filtersInitialized, onCitiesUpdate]);

    return { features, isUpdating, error };
}
