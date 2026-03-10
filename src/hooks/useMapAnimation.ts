import { useState, useEffect, useRef } from 'react';

/**
 * SOTA Map Animation Hook
 * Manages the "Shooting Star" traveler logic and synchronizes popups with movement completion.
 */
export function useMapAnimation(activeTourFeature: GeoJSON.Feature | null) {
    const [delayedTourFeature, setDelayedTourFeature] = useState<GeoJSON.Feature | null>(null);
    const [travelerGeoJSON, setTravelerGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
    const lastTourCoords = useRef<[number, number] | null>(null);
    const animationFrameId = useRef<number | null>(null);

    useEffect(() => {
        // Cleanup if no feature
        if (!activeTourFeature) {
            setDelayedTourFeature(null);
            setTravelerGeoJSON(null);
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            return;
        }

        const newCoords = (activeTourFeature.geometry as any).coordinates as [number, number];
        
        // Hide existing popup immediately when movement starts
        setDelayedTourFeature(null);

        // CASE 1: First subject (no animation needed)
        if (!lastTourCoords.current) {
            lastTourCoords.current = newCoords;
            setTravelerGeoJSON({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: newCoords },
                    properties: {}
                }]
            });
            setDelayedTourFeature(activeTourFeature);
            return;
        }

        // CASE 2: Animate from previous to new
        const start = lastTourCoords.current;
        const end = newCoords;
        const duration = 1000;
        const startTime = performance.now();

        const animate = (timestamp: number) => {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // easeOutExpo for professional feeling
            const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

            const currentLng = start[0] + (end[0] - start[0]) * easedProgress;
            const currentLat = start[1] + (end[1] - start[1]) * easedProgress;

            const newGeoJSON = {
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [currentLng, currentLat] },
                    properties: {}
                }]
            } as GeoJSON.FeatureCollection;

            setTravelerGeoJSON(newGeoJSON);

            if (progress < 1) {
                animationFrameId.current = requestAnimationFrame(animate);
            } else {
                lastTourCoords.current = end;
                setDelayedTourFeature(activeTourFeature);
            }
        };

        animationFrameId.current = requestAnimationFrame(animate);

        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, [activeTourFeature]);

    return {
        delayedTourFeature,
        travelerGeoJSON
    };
}
