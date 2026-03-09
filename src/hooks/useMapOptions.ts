import { useState, useEffect } from 'react';
import { Topic } from '@prisma/client';
import { CityOption, CityWithGeometryAndCounts } from '@/types/map';

/**
 * Hook to load and manage map options (topics and cities)
 */
export function useMapOptions() {
    const [allTopics, setAllTopics] = useState<Topic[]>([]);
    const [allCities, setAllCities] = useState<CityOption[]>([]);
    const [citiesWithGeometry, setCitiesWithGeometry] = useState<CityWithGeometryAndCounts[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadOptions() {
            try {
                const [topicsResponse, citiesResponse] = await Promise.all([
                    fetch('/api/topics'),
                    fetch('/api/cities/map')
                ]);

                const topics: Topic[] = await topicsResponse.json();
                const cities: CityWithGeometryAndCounts[] = await citiesResponse.json();

                setAllTopics(topics);
                setCitiesWithGeometry(cities);

                const citiesWithMeetings: CityOption[] = cities
                    .filter(c => c._count?.councilMeetings > 0)
                    .map(c => ({
                        id: c.id,
                        name: c.name,
                        name_en: c.name_en,
                        meetingsCount: c._count?.councilMeetings || 0
                    }));
                setAllCities(citiesWithMeetings);
            } catch (error) {
                console.error('Error loading map options:', error);
            } finally {
                setIsLoading(false);
            }
        }

        loadOptions();
    }, []);

    return {
        allTopics,
        allCities,
        citiesWithGeometry,
        isLoading
    };
}
