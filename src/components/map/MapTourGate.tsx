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
    const [isGateOpen, setIsGateOpen] = useState<boolean | null>(null);

    useEffect(() => {
        // SIMULATION: Calling backend for feature flag
        // In reality, this could be: const { enabled } = await fetch('/api/flags/map-tour')
        const checkBackendFlag = async () => {
            try {
                // We default to true, but this is where the backend control lives
                setIsGateOpen(true);
            } catch (e) {
                setIsGateOpen(false);
            }
        };
        
        checkBackendFlag();
    }, []);

    // If backend hasn't responded or feature is disabled, render nothing
    if (!isGateOpen) return null;

    return <MapTourManager {...props} />;
}
