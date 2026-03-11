import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapFeature } from '@/components/map/map';

interface UseMapTourProps {
    features: MapFeature[];
    selectedCities: string[];
    allCities: { id: string, name: string }[];
    isEnabled: boolean;
}

export function useMapTour({ features, selectedCities, allCities, isEnabled }: UseMapTourProps) {
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isPaused, setIsPaused] = useState(false);
    const [isManualInterruption, setIsManualInterruption] = useState(false);

    // Identify if we are in a single-city view
    const isSingleCity = selectedCities.length === 1;
    const cityId = isSingleCity ? selectedCities[0] : null;
    const cityName = useMemo(() => {
        if (!cityId) return '';
        return allCities.find(c => c.id === cityId)?.name || '';
    }, [cityId, allCities]);

    // Get top 10 recent subjects for this city
    const tourSubjects = useMemo(() => {
        if (!isSingleCity || !cityId || !isEnabled || isManualInterruption) return [];

        return features
            .filter(f => f.properties?.featureType === 'subject' && f.properties?.cityId === cityId)
            .sort((a, b) => {
                const dateA = new Date(a.properties?.meetingDate || 0).getTime();
                const dateB = new Date(b.properties?.meetingDate || 0).getTime();
                return dateB - dateA;
            })
            .slice(0, 10);
    }, [features, cityId, isSingleCity, isEnabled, isManualInterruption]);

    const activeFeature = activeIndex >= 0 ? tourSubjects[activeIndex] : null;

    // Timer logic
    useEffect(() => {
        if (tourSubjects.length === 0 || isPaused || isManualInterruption) {
            if (tourSubjects.length === 0) setActiveIndex(-1);
            return;
        }

        // Start from first if not started
        if (activeIndex === -1) {
            setActiveIndex(0);
        }

        const interval = setInterval(() => {
            setActiveIndex(current => (current + 1) % tourSubjects.length);
        }, 3500);

        return () => clearInterval(interval);
    }, [tourSubjects.length, isPaused, isManualInterruption, activeIndex]);

    // Reset when city changes or tour is disabled
    useEffect(() => {
        setActiveIndex(-1);
        setIsManualInterruption(false);
        setIsPaused(false);
    }, [cityId, isEnabled]);

    const stopTour = useCallback(() => {
        setIsManualInterruption(true);
        setActiveIndex(-1);
    }, []);

    return {
        tourSubjects,
        activeIndex,
        activeFeature,
        isPaused,
        setIsPaused,
        isSingleCity,
        cityName,
        stopTour,
        isActive: tourSubjects.length > 0 && !isManualInterruption
    };
}
