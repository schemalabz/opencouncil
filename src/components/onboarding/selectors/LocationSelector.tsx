'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, MapPin, AlertCircle, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Location } from '@/lib/types/onboarding';
import { getPlaceSuggestions, getPlaceDetails, PlaceSuggestion, PlaceSuggestionsResult } from '@/lib/google-maps';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { calculateGeometryBounds } from '@/lib/geo';
import { getRealmGeocoding } from '@/lib/realm';
import { CityWithGeometry } from '@/lib/db/cities';

interface LocationSelectorProps {
    selectedLocations: Location[];
    onSelect: (location: Location) => void;
    onRemove: (index: number) => void;
    city: CityWithGeometry;
    onLocationClick?: (location: Location) => void;
    hideSelectedList?: boolean;
    /**
     * When true, once at least one location has been added the search input is
     * collapsed into an "add a new location" button, making the
     * "you can add more than one" affordance explicit. Opt-in so the shared
     * consultations usages (LocationNavigator, LayerControlsPanel) keep their
     * always-visible search input. Defaults to false.
     */
    collapseAfterAdd?: boolean;
}

export function LocationSelector({
    selectedLocations,
    onSelect,
    onRemove,
    city,
    onLocationClick,
    hideSelectedList = false,
    collapseAfterAdd = false
}: LocationSelectorProps) {
    const t = useTranslations('Common');
    const [inputValue, setInputValue] = useState('');
    // When collapseAfterAdd is enabled, start collapsed if the user already has
    // locations (e.g. re-entering the step via back navigation).
    const [isSearchVisible, setIsSearchVisible] = useState(
        () => !(collapseAfterAdd && selectedLocations.length > 0)
    );
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isSelectingLocation, setIsSelectingLocation] = useState(false);
    const [isWaitingForDebounce, setIsWaitingForDebounce] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
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

    const handleSelectLocation = async (suggestion: PlaceSuggestion) => {
        if (isSelectingLocation) return;

        setIsSelectingLocation(true);
        setError(null);

        try {
            const placeDetails = await getPlaceDetails(suggestion.placeId, getRealmGeocoding(city.realm).language);

            if (placeDetails) {
                const location: Location = {
                    text: placeDetails.text,
                    coordinates: placeDetails.coordinates
                };

                onSelect(location);
                setInputValue('');
                setSuggestions([]);
                setIsWaitingForDebounce(false);
                // Collapse the search back into the "add new location" button
                // after a successful add, so the affordance is explicit.
                if (collapseAfterAdd) {
                    setIsSearchVisible(false);
                }
            } else {
                setError(t('locationDetailsUnavailable'));
            }
        } catch (error) {
            console.error('Error fetching place details:', error);
            setError(t('locationDetailsError'));
        } finally {
            setIsSelectingLocation(false);
        }
    };

    // When collapseAfterAdd is on and there is at least one location, hide the
    // search input behind a button until the user opts to add another.
    const showAddButton = collapseAfterAdd && selectedLocations.length > 0 && !isSearchVisible;

    return (
        <div className="space-y-5">
            {showAddButton ? (
                <Button
                    variant="outline"
                    onClick={() => {
                        setIsSearchVisible(true);
                        // Focus the input once React has rendered the search box,
                        // so the user can type without an extra tap. Safe here
                        // because revealing is a deliberate user action.
                        setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="w-full justify-center py-5 text-base md:text-sm touch-manipulation"
                >
                    <Plus className="h-5 w-5 md:h-4 md:w-4 mr-2" />
                    {t('addNewLocation')}
                </Button>
            ) : (
            <div className="relative">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            ref={inputRef}
                            type="text"
                            inputMode="search"
                            autoComplete="off"
                            data-1p-ignore
                            data-lpignore="true"
                            data-form-type="other"
                            placeholder={t('searchAddressPlaceholder', { cityName: city.name })}
                            aria-label={t('searchAddressInMunicipality', { cityName: city.name })}
                            className={`pl-10 py-5 text-base md:text-sm ${(isLoadingSuggestions || isSelectingLocation || isWaitingForDebounce) ? 'pr-10' : ''}`}
                            value={inputValue}
                            onChange={handleInputChange}
                            disabled={isSelectingLocation}
                        />
                        {(isLoadingSuggestions || isSelectingLocation || isWaitingForDebounce) && (
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none z-10">
                                <Loader2 className="h-5 w-5 md:h-4 md:w-4 animate-spin text-primary" />
                            </div>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                            setInputValue('');
                            setError(null);
                            setIsWaitingForDebounce(false);
                            setSuggestions([]);
                        }}
                        className={cn(
                            "transition-opacity h-11 w-11 md:h-10 md:w-10 touch-manipulation",
                            inputValue ? "opacity-100" : "opacity-0"
                        )}
                        disabled={!inputValue}
                    >
                        <X className="h-5 w-5 md:h-4 md:w-4" />
                    </Button>
                </div>

                {error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md text-sm flex items-center gap-2 text-red-600">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {suggestions.length > 0 && (
                    <div className="absolute z-10 mt-2 w-full bg-white rounded-md shadow-lg max-h-60 overflow-auto border border-gray-200">
                        <ul className="py-1">
                            {suggestions.map((suggestion) => (
                                <li
                                    key={suggestion.id}
                                    className={cn(
                                        "px-4 py-4 md:py-3 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b last:border-b-0 border-gray-100 touch-manipulation min-h-[48px] md:min-h-0",
                                        isSelectingLocation ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                                    )}
                                    onClick={() => !isSelectingLocation && handleSelectLocation(suggestion)}
                                >
                                    <MapPin className="h-5 w-5 md:h-4 md:w-4 text-primary flex-shrink-0" />
                                    <span className="line-clamp-2 text-base md:text-sm">{suggestion.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            )}

            {!hideSelectedList && (selectedLocations.length > 0 ? (
                <div className="mt-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">{t('selectedLocationsCount', { count: selectedLocations.length })}</div>
                    <div className="grid grid-cols-1 gap-2">
                        {selectedLocations.map((location, index) => (
                            <div
                                key={`loc-${index}`}
                                className={`flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-primary/40 hover:bg-primary/5 transition-colors group ${onLocationClick ? 'cursor-pointer' : ''
                                    }`}
                                onClick={() => onLocationClick?.(location)}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                                    <div className="truncate text-sm font-medium">{location.text}</div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-11 md:h-7 px-3 md:px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full flex-shrink-0 opacity-80 group-hover:opacity-100 touch-manipulation min-w-[88px] md:min-w-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemove(index);
                                    }}
                                >
                                    <X className="h-4 w-4 md:h-3 md:w-3 mr-1" />
                                    <span className="hidden sm:inline">{t('remove')}</span>
                                    <span className="sm:hidden">{t('removeShort')}</span>
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="mt-6 text-center p-6 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                    <MapPin className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-gray-500 text-sm">{t('noLocationsSelected')}</p>
                    <p className="text-gray-500 text-xs mt-1">{t('noLocationsHint')}</p>
                </div>
            ))}
        </div>
    );
} 