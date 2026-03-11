import { useEffect } from 'react';
import { Topic } from '@prisma/client';
import { UserPreference } from '@/lib/db/notifications';
import { MapFiltersState, CityWithGeometryAndCounts } from '@/types/map';

interface UseMapPersonalizationProps {
    allTopics: Topic[];
    allCities: string[];
    citiesWithGeometry: CityWithGeometryAndCounts[];
    onFiltersChange: (filters: MapFiltersState) => void;
    onZoomChange: (geometry: GeoJSON.Geometry | null) => void;
}

/**
 * Hook to handle user preference-based personalization
 * Auto-selects preferred city and topics on mount
 */
export function useMapPersonalization({
    allTopics,
    allCities,
    citiesWithGeometry,
    onFiltersChange,
    onZoomChange
}: UseMapPersonalizationProps) {
    useEffect(() => {
        if (allTopics.length === 0 || allCities.length === 0 || citiesWithGeometry.length === 0) {
            return;
        }

        async function applyPersonalization() {
            try {
                // Fetch user preferences from API route (not server action directly)
                const response = await fetch('/api/user/preferences');
                const userPrefs: UserPreference[] = await response.json();

                if (userPrefs && userPrefs.length > 0) {
                    const primaryPref = userPrefs[0];
                    const preferredTopicIds = new Set(
                        primaryPref.topics?.map((t: Topic) => t.id) || []
                    );

                    const initialFilters: MapFiltersState = {
                        monthsBack: 6,
                        selectedTopics: preferredTopicIds.size > 0
                            ? allTopics.filter((t: Topic) => preferredTopicIds.has(t.id))
                            : allTopics,
                        selectedCities: [primaryPref.cityId],
                        selectedBodyTypes: ['council', 'committee', 'community']
                    };

                    onFiltersChange(initialFilters);

                    // Auto-zoom to preferred city - find geometry from loaded cities
                    const preferredCity = citiesWithGeometry.find(c => c.id === primaryPref.cityId);
                    if (preferredCity?.geometry) {
                        onZoomChange(preferredCity.geometry as GeoJSON.Geometry);
                    }
                } else {
                    // Default: Select all topics and all cities
                    onFiltersChange({
                        monthsBack: 6,
                        selectedTopics: allTopics,
                        selectedCities: allCities,
                        selectedBodyTypes: ['council', 'committee', 'community']
                    });
                }
            } catch (e) {
                // Not authenticated or error - use defaults
                onFiltersChange({
                    monthsBack: 6,
                    selectedTopics: allTopics,
                    selectedCities: allCities,
                    selectedBodyTypes: ['council', 'committee', 'community']
                });
            }
        }

        applyPersonalization();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allTopics.length, allCities.length, citiesWithGeometry.length]); // Only run when data is loaded
}
