"use client"
import { useState, useEffect } from 'react';
import { MapTourManager } from './MapTourManager';
import { MapFeature } from './map';

interface MapTourGateProps {
    features: MapFeature[];
    selectedCities: string[];
    allCities: { id: string, name: string }[];
    isUIBlocked: boolean;
    onUpdateMap: (tourFeature: GeoJSON.Feature | null, travelerGeoJSON: GeoJSON.FeatureCollection | null, isPaused: boolean) => void;
}

/**
 * SOTA Feature Gate
 * Responsible for verifying backend permission before enabling the feature.
 * In a real 2026 app, this would call an Edge Config or a Feature Flag service.
 */
export function MapTourGate(props: MapTourGateProps) {
    // Initialize to true to avoid initial render delay (flash of null content)
    // In a real 2026 app, this would be hydrated from a server component or edge config
    const [isGateOpen, setIsGateOpen] = useState<boolean>(true);

    useEffect(() => {
        // SIMULATION: Calling backend for feature flag
        // In reality, this could be: const { enabled } = await fetch('/api/flags/map-tour')
        const checkBackendFlag = async () => {
            try {
                // If we needed an async check, we would do it here
                // For now, we remain open
                setIsGateOpen(true);
            } catch (e) {
                console.error('Feature gate error:', e);
            }
        };
        
        checkBackendFlag();
    }, []);

    // If backend explicitly disabled the feature, render nothing
    if (!isGateOpen) return null;

    return <MapTourManager {...props} />;
}
