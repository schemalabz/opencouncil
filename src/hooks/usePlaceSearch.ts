"use client";

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDebounce } from '@/hooks/use-debounce';
import { getPlaceSuggestions, getPlaceDetails, PlaceSuggestion, PlaceSuggestionsResult } from '@/lib/google-maps';
import { calculateGeometryBounds } from '@/lib/geo';
import { getRealmGeocoding } from '@/lib/realm';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { Location } from '@/lib/types/onboarding';

/**
 * Address search within one municipality: the typed text, Google Places suggestions near the
 * city, and the chosen suggestion resolved to a point. Shared by every address box, whatever
 * it looks like.
 */
export function usePlaceSearch(city: CityWithGeometry) {
    const t = useTranslations('Common');
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isSelectingLocation, setIsSelectingLocation] = useState(false);
    const [isWaitingForDebounce, setIsWaitingForDebounce] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Debounce the input value to avoid making too many API calls
    const debouncedInputValue = useDebounce(inputValue, 300);

    // Helper function to get user-friendly error messages
    const getErrorMessage = useCallback((result: PlaceSuggestionsResult, searchQuery: string): string => {
        if (!result.error) {
            // No API error, just empty results
            return t('locationSearchNoResults', { query: searchQuery, cityName: city.name });
        }

        // Handle different types of API errors
        if (result.error.type === 'API_ERROR') {
            if (result.error.status === 'REQUEST_DENIED') {
                return t('locationSearchUnavailable');
            } else if (result.error.status === 'OVER_QUERY_LIMIT') {
                return t('locationSearchLimitExceeded');
            } else {
                return t('locationSearchApiError', { status: result.error.status ?? '' });
            }
        } else if (result.error.type === 'NETWORK_ERROR') {
            return t('locationSearchNetworkError');
        }

        return t('locationSearchGenericError');
    }, [city.name, t]);

    // Fetch place suggestions from the Google API
    useEffect(() => {
        async function fetchSuggestions() {
            // Reset error state
            setError(null);

            if (debouncedInputValue.trim().length > 2) {
                setIsWaitingForDebounce(false); // No longer waiting, now actually fetching
                setIsLoadingSuggestions(true);
                try {
                    // Extract city center coordinates from geometry if available
                    let cityCoordinates: [number, number] | undefined;

                    if (city.geometry) {
                        // Calculate center from city geometry
                        const { center } = calculateGeometryBounds(city.geometry);
                        cityCoordinates = center;
                    }

                    // Pass the city name and coordinates to restrict suggestions to this
                    // municipality, plus the realm's country/language so a French city
                    // searches French addresses (not Greek ones).
                    const result = await getPlaceSuggestions(
                        debouncedInputValue,
                        city.name,
                        cityCoordinates,
                        getRealmGeocoding(city.realm)
                    );

                    setSuggestions(result.data);

                    // Show error if there's an API error or no results for longer queries
                    if (result.error || (result.data.length === 0 && debouncedInputValue.trim().length > 3)) {
                        setError(getErrorMessage(result, debouncedInputValue));
                    }
                } catch (error) {
                    console.error('Unexpected error fetching place suggestions:', error);
                    setError(t('locationSearchGenericError'));
                } finally {
                    setIsLoadingSuggestions(false);
                    // Don't refocus on mobile - it causes the keyboard to dismiss
                }
            } else {
                setIsWaitingForDebounce(false);
                setSuggestions([]);
            }
        }

        fetchSuggestions();
    }, [debouncedInputValue, city.name, city.geometry, city.realm, getErrorMessage, t]);

    const changeInput = (newValue: string) => {
        setInputValue(newValue);
        setError(null); // Clear any error when input changes

        // Show loading immediately if input is long enough (will trigger search after debounce)
        if (newValue.trim().length > 2) {
            setIsWaitingForDebounce(true);
        } else {
            setIsWaitingForDebounce(false);
            setSuggestions([]);
        }
    };

    const clear = () => {
        setInputValue('');
        setError(null);
        setIsWaitingForDebounce(false);
        setSuggestions([]);
    };

    /** Resolves a suggestion to a point; on success the search is cleared for the next one. */
    const select = async (suggestion: PlaceSuggestion): Promise<Location | null> => {
        if (isSelectingLocation) return null;

        setIsSelectingLocation(true);
        setError(null);

        try {
            const placeDetails = await getPlaceDetails(suggestion.placeId, getRealmGeocoding(city.realm).language);

            if (placeDetails) {
                setInputValue('');
                setSuggestions([]);
                setIsWaitingForDebounce(false);
                return { text: placeDetails.text, coordinates: placeDetails.coordinates };
            }
            setError(t('locationDetailsUnavailable'));
        } catch (error) {
            console.error('Error fetching place details:', error);
            setError(t('locationDetailsError'));
        } finally {
            setIsSelectingLocation(false);
        }
        return null;
    };

    return {
        inputValue,
        changeInput,
        suggestions,
        isBusy: isLoadingSuggestions || isSelectingLocation || isWaitingForDebounce,
        isSelecting: isSelectingLocation,
        error,
        clear,
        select,
    };
}
