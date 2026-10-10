'use client';

import { useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { getPlaceDetails, getPlaceSuggestions, type PlaceSuggestion, type PlaceSuggestionsResult } from '@/lib/google-maps';
import { calculateGeometryBounds } from '@/lib/geo';
import { getRealmGeocoding } from '@/lib/realm';
import type { CityWithGeometry } from '@/lib/db/cities';
import type { Location } from '@/lib/types/onboarding';

/**
 * Why a search or a pick failed, as a kind rather than a sentence: each
 * surface words it in its own register (the consultations map formally, the
 * signup informally) and can count the kinds it cares about.
 */
export type LocationSearchError =
    | { kind: 'noResults'; query: string }
    | { kind: 'unavailable' }
    | { kind: 'limitExceeded' }
    | { kind: 'apiError'; status: string }
    | { kind: 'network' }
    | { kind: 'generic' }
    | { kind: 'detailsUnavailable' }
    | { kind: 'detailsError' };

function searchErrorFor(result: PlaceSuggestionsResult, query: string): LocationSearchError {
    if (!result.error) return { kind: 'noResults', query };
    if (result.error.type === 'API_ERROR') {
        if (result.error.status === 'REQUEST_DENIED') return { kind: 'unavailable' };
        if (result.error.status === 'OVER_QUERY_LIMIT') return { kind: 'limitExceeded' };
        return { kind: 'apiError', status: result.error.status ?? '' };
    }
    if (result.error.type === 'NETWORK_ERROR') return { kind: 'network' };
    return { kind: 'generic' };
}

/**
 * An address search inside one municipality: the typed text, Google's
 * suggestions for it (debounced, biased to the municipality's centre and
 * restricted to its realm's country), and the pick that turns a suggestion
 * into a place with coordinates.
 */
export function useLocationSearch(city: Pick<CityWithGeometry, 'name' | 'geometry' | 'realm'>) {
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const [isWaitingForDebounce, setIsWaitingForDebounce] = useState(false);
    const [error, setError] = useState<LocationSearchError | null>(null);
    // What the box holds now, so a reply that arrives after the reader typed on, cleared the box
    // or picked a place is dropped instead of showing suggestions for an abandoned query.
    const currentInput = useRef('');

    // Debounce the input value to avoid making too many API calls
    const debouncedInputValue = useDebounce(inputValue, 300);

    useEffect(() => {
        let cancelled = false;
        async function fetchSuggestions() {
            setError(null);

            if (debouncedInputValue.trim().length > 2) {
                setIsWaitingForDebounce(false); // No longer waiting, now actually fetching
                setIsLoadingSuggestions(true);
                try {
                    const cityCoordinates = city.geometry ? calculateGeometryBounds(city.geometry).center : undefined;

                    // Pass the city name and coordinates to restrict suggestions to this
                    // municipality, plus the realm's country/language so a French city
                    // searches French addresses (not Greek ones).
                    const result = await getPlaceSuggestions(
                        debouncedInputValue,
                        city.name,
                        cityCoordinates,
                        getRealmGeocoding(city.realm)
                    );

                    if (cancelled || currentInput.current.trim() !== debouncedInputValue.trim()) return;
                    setSuggestions(result.data);

                    // Show error if there's an API error or no results for longer queries
                    if (result.error || (result.data.length === 0 && debouncedInputValue.trim().length > 3)) {
                        setError(searchErrorFor(result, debouncedInputValue));
                    }
                } catch (error) {
                    console.error('Unexpected error fetching place suggestions:', error);
                    if (!cancelled) setError({ kind: 'generic' });
                } finally {
                    if (!cancelled) setIsLoadingSuggestions(false);
                    // Don't refocus on mobile - it causes the keyboard to dismiss
                }
            } else {
                setIsWaitingForDebounce(false);
                setIsLoadingSuggestions(false);
                setSuggestions([]);
            }
        }

        fetchSuggestions();
        return () => {
            cancelled = true;
        };
    }, [debouncedInputValue, city.name, city.geometry, city.realm]);

    const changeInput = (value: string) => {
        currentInput.current = value;
        setInputValue(value);
        setError(null);

        // Show loading immediately if input is long enough (will trigger search after debounce)
        if (value.trim().length > 2) {
            setIsWaitingForDebounce(true);
        } else {
            setIsWaitingForDebounce(false);
            setSuggestions([]);
        }
    };

    const clear = () => {
        currentInput.current = '';
        setInputValue('');
        setError(null);
        setIsWaitingForDebounce(false);
        setSuggestions([]);
    };

    /** The suggestion as a place, or null when Google could not resolve it (the error says why). */
    const select = async (suggestion: PlaceSuggestion): Promise<Location | null> => {
        if (isSelecting) return null;

        setIsSelecting(true);
        setError(null);

        try {
            const placeDetails = await getPlaceDetails(suggestion.placeId, getRealmGeocoding(city.realm).language);
            if (!placeDetails) {
                setError({ kind: 'detailsUnavailable' });
                return null;
            }
            currentInput.current = '';
            setInputValue('');
            setSuggestions([]);
            setIsWaitingForDebounce(false);
            return { text: placeDetails.text, coordinates: placeDetails.coordinates };
        } catch (error) {
            console.error('Error fetching place details:', error);
            setError({ kind: 'detailsError' });
            return null;
        } finally {
            setIsSelecting(false);
        }
    };

    return {
        inputValue,
        changeInput,
        clear,
        suggestions,
        select,
        error,
        isSelecting,
        /** Typing, fetching or resolving a pick: the moment for a spinner. */
        busy: isLoadingSuggestions || isSelecting || isWaitingForDebounce,
    };
}
