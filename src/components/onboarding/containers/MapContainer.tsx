'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { MapFeature } from '@/components/map/map';
import { calculateGeometryBounds } from '@/lib/utils';
import Map from '@/components/map/map';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Map as MapIcon } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';

// Utility function to calculate center and zoom from GeoJSON
function calculateMapView(geometry: any): { center: [number, number]; zoom: number } {
    const { bounds, center } = calculateGeometryBounds(geometry);
    
    let zoom = 10; // Default zoom
    if (bounds) {
        const lngDiff = bounds.maxLng - bounds.minLng;
        const latDiff = bounds.maxLat - bounds.minLat;
        const maxDiff = Math.max(lngDiff, latDiff);
        zoom = Math.max(8, Math.min(13, 11 - Math.log2(maxDiff * 111))); // 111km per degree
    }

    return { center, zoom };
}

export function MapContainer() {
    const isDesktop = useMediaQuery('(min-width: 1024px)');
    const { 
        city, 
        selectedLocations, 
        isMapVisible, 
        setMapVisible,
        isFormVisible,
        setFormVisible
    } = useOnboarding();

    // Use refs to track previous values
    const prevCityRef = useRef(city);
    const prevLocationsRef = useRef(selectedLocations);

    // Derive map features from city and locations
    const mapFeatures = useMemo(() => {
        if (!city) return [];

        const cityFeature = {
            id: city.id,
            geometry: city.geometry,
            style: {
                fillColor: '#627BBC',
                fillOpacity: 0.2,
                strokeColor: '#4263EB',
                strokeWidth: 2
            }
        };

        if (selectedLocations.length === 0) {
            return [cityFeature];
        }

        const locationFeatures = selectedLocations.map((location, index) => {
            const lng = parseFloat(String(location.coordinates[0]));
            const lat = parseFloat(String(location.coordinates[1]));

            const hasValidCoordinates =
                !isNaN(lng) && isFinite(lng) &&
                !isNaN(lat) && isFinite(lat);

            if (!hasValidCoordinates) {
                return null;
            }

            return {
                id: `location-${index}`,
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat] as [number, number]
                },
                style: {
                    fillColor: '#EF4444',
                    fillOpacity: 0.8,
                    strokeColor: '#B91C1C',
                    strokeWidth: 6
                }
            };
        }).filter(Boolean) as MapFeature[];

        return [cityFeature, ...locationFeatures];
    }, [city, selectedLocations]);

    // Derive map center and zoom from city geometry
    const { center: mapCenter, zoom: mapZoom } = useMemo(() => {
        if (!city?.geometry) {
            return {
                center: [23.7275, 37.9838] as [number, number],
                zoom: 6
            };
        }
        return calculateMapView(city.geometry);
    }, [city?.geometry]);

    useEffect(() => {
        if (prevCityRef.current !== city) {
            prevCityRef.current = city;
        }
    }, [city]);

    useEffect(() => {
        if (prevLocationsRef.current !== selectedLocations) {
            prevLocationsRef.current = selectedLocations;
        }
    }, [selectedLocations]);

    return (
        <>
            <div
                className={cn(
                    "absolute inset-0 transition-all duration-300 ease-in-out",
                    !isMapVisible && "opacity-0 pointer-events-none",
                    isDesktop ? "left-0" : "left-0"
                )}
            >
                <Map
                    features={mapFeatures}
                    center={mapCenter}
                    zoom={mapZoom}
                    className="w-full h-full"
                />
            </div>

            {/* Mobile controls */}
            {!isDesktop && (
                <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
                    <Button
                        variant="default"
                        size="icon"
                        className="rounded-full shadow-lg"
                        onClick={() => setFormVisible(!isFormVisible)}
                    >
                        {isFormVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                    </Button>

                    {isFormVisible && (
                        <Button
                            variant="outline"
                            size="icon"
                            className="rounded-full shadow-lg bg-white/80"
                            onClick={() => setMapVisible(!isMapVisible)}
                        >
                            <MapIcon size={20} className={isMapVisible ? "text-primary" : "text-gray-400"} />
                        </Button>
                    )}
                </div>
            )}
        </>
    );
} 