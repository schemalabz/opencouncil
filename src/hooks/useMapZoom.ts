import { useState, useEffect } from 'react';
import { CityWithGeometryAndCounts } from '@/types/map';

/**
 * Hook to manage map zoom behavior
 * Auto-zooms to selected city when only one is selected
 */
export function useMapZoom(
    selectedCities: string[],
    citiesWithGeometry: CityWithGeometryAndCounts[]
) {
    const [zoomToGeometry, setZoomToGeometry] = useState<GeoJSON.Geometry | null>(null);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        if (selectedCities.length === 1 && citiesWithGeometry.length > 0) {
            const selectedCityId = selectedCities[0];
            const selectedCity = citiesWithGeometry.find(c => c.id === selectedCityId);

            if (selectedCity?.geometry) {
                const geometry = selectedCity.geometry;
                // Force re-trigger by clearing first, then setting in next tick
                setZoomToGeometry(null);
                timeoutId = setTimeout(() => {
                    setZoomToGeometry(geometry);
                }, 0);
            }
        } else {
            // Reset zoom when multiple or no cities selected
            setZoomToGeometry(null);
        }

        return () => {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        };
    }, [selectedCities, citiesWithGeometry]);

    return { zoomToGeometry, setZoomToGeometry };
}
