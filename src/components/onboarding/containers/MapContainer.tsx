'use client';

import { useMemo } from 'react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import CivicMap from '@/components/map/civic/CivicMap';
import type { MapReferenceMarker } from '@/lib/map/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Map as MapIcon } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-media-query';

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

    // The user's picked notification locations as labeled reference dots
    const referenceMarkers = useMemo<MapReferenceMarker[]>(() => {
        return selectedLocations
            .map((location, index): MapReferenceMarker | null => {
                const lng = parseFloat(String(location.coordinates[0]));
                const lat = parseFloat(String(location.coordinates[1]));
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                return {
                    id: `location-${index}`,
                    coordinates: [lng, lat],
                    label: location.text || `Τοποθεσία ${index + 1}`,
                    color: '#EF4444',
                };
            })
            .filter((marker): marker is MapReferenceMarker => marker !== null);
    }, [selectedLocations]);

    // Fit the city boundary initially, then all picked locations as they're added
    const fitTarget = useMemo((): GeoJSON.Geometry | null => {
        if (!city) return null;
        if (referenceMarkers.length === 0) return city.geometry ?? null;
        return {
            type: 'GeometryCollection',
            geometries: referenceMarkers.map(marker => ({ type: 'Point' as const, coordinates: marker.coordinates })),
        };
    }, [city, referenceMarkers]);

    if (!city) return null;

    return (
        <>
            <div
                className={cn(
                    "absolute inset-0 transition-all duration-300 ease-in-out",
                    !isMapVisible && "opacity-0 pointer-events-none",
                )}
            >
                <CivicMap
                    className="h-full w-full"
                    subjects={[]}
                    contextBoundary={city.geometry ?? null}
                    referenceMarkers={referenceMarkers}
                    camera={{ fitTo: fitTarget, padding: 120 }}
                />
            </div>

            {/* Mobile controls */}
            {!isDesktop && (
                <div
                    className={cn(
                        "fixed right-4 z-50 flex flex-col gap-3 transition-[bottom] duration-300",
                        isFormVisible ? "bottom-28" : "bottom-6",
                    )}
                >
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
