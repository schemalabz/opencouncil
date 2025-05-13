'use client';

import { useState, useRef, useEffect } from 'react';
import { X, MapPin, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Location, City } from './SignupPageContent';
import { getPlaceSuggestions, getPlaceDetails, PlaceSuggestion } from '@/lib/google-maps';
import { useDebounce } from '@/hooks/use-debounce';

interface LocationSelectorProps {
    selectedLocations: Location[];
    onSelect: (location: Location) => void;
    onRemove: (locationId: string) => void;
    city: City;
}

export function LocationSelector({
    selectedLocations,
    onSelect,
    onRemove,
    city
}: LocationSelectorProps) {
    const [inputValue, setInputValue] = useState('');
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounce the input value to avoid making too many API calls
    const debouncedInputValue = useDebounce(inputValue, 300);

    // Fetch place suggestions from the Google API
    useEffect(() => {
        async function fetchSuggestions() {
            // Reset error state
            setError(null);

            if (debouncedInputValue.trim().length > 2) {
                setIsLoading(true);
                try {
                    // Extract city center coordinates from geometry if available
                    let cityCoordinates: [number, number] | undefined;

                    if (city.geometry) {
                        // Calculate center from city geometry
                        const { center } = calculateCityCenter(city.geometry);
                        cityCoordinates = center;
                    }

                    // Pass the city name and coordinates to restrict suggestions to this municipality
                    const placeSuggestions = await getPlaceSuggestions(
                        debouncedInputValue,
                        city.name,
                        cityCoordinates
                    );

                    setSuggestions(placeSuggestions);

                    // If we got no results, set a friendly message
                    if (placeSuggestions.length === 0 && debouncedInputValue.trim().length > 3) {
                        setError(`Δεν βρέθηκαν αποτελέσματα για "${debouncedInputValue}" στον δήμο ${city.name}`);
                    }
                } catch (error) {
                    console.error('Error fetching place suggestions:', error);
                    setError('Σφάλμα κατά την αναζήτηση τοποθεσιών. Παρακαλώ δοκιμάστε ξανά.');
                } finally {
                    setIsLoading(false);
                }
            } else {
                setSuggestions([]);
            }
        }

        fetchSuggestions();
    }, [debouncedInputValue, city.name, city.geometry]);

    // Helper function to calculate city center
    const calculateCityCenter = (geometry: any): { center: [number, number] } => {
        if (!geometry) {
            return { center: [23.7275, 37.9838] }; // Default to Athens
        }

        try {
            if (geometry.type === 'Polygon') {
                // Calculate center from polygon
                const coords = geometry.coordinates[0];
                let minLng = Infinity, maxLng = -Infinity;
                let minLat = Infinity, maxLat = -Infinity;

                coords.forEach((point: [number, number]) => {
                    const [lng, lat] = point;
                    minLng = Math.min(minLng, lng);
                    maxLng = Math.max(maxLng, lng);
                    minLat = Math.min(minLat, lat);
                    maxLat = Math.max(maxLat, lat);
                });

                return {
                    center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
                };
            }
            else if (geometry.type === 'MultiPolygon') {
                // Handle MultiPolygon by using the first polygon
                return calculateCityCenter({
                    type: 'Polygon',
                    coordinates: geometry.coordinates[0]
                });
            }
            else if (geometry.type === 'Point') {
                // For points, just use the coordinates directly
                return { center: [geometry.coordinates[0], geometry.coordinates[1]] };
            }
        } catch (error) {
            console.error('Error calculating city center:', error);
        }

        // Default fallback
        return { center: [23.7275, 37.9838] };
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        setError(null); // Clear any error when input changes
    };

    const handleSelectLocation = async (suggestion: PlaceSuggestion) => {
        setIsLoading(true);
        setError(null); // Clear any error when selecting a location

        try {
            const placeDetails = await getPlaceDetails(suggestion.placeId);

            if (placeDetails) {
                const location: Location = {
                    id: suggestion.id,
                    text: placeDetails.text,
                    coordinates: placeDetails.coordinates
                };

                onSelect(location);
                setInputValue('');
                setSuggestions([]);
            } else {
                setError('Δεν ήταν δυνατή η ανάκτηση των λεπτομερειών της τοποθεσίας.');
            }
        } catch (error) {
            console.error('Error fetching place details:', error);
            setError('Σφάλμα κατά την ανάκτηση των λεπτομερειών της τοποθεσίας.');
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <h3 className="text-lg font-medium mb-3">Τοποθεσίες ενδιαφέροντος</h3>
                <p className="text-sm text-gray-700 mb-3">
                    Επιλέξτε τοποθεσίες στον δήμο {city.name} για τις οποίες θέλετε να λαμβάνετε ενημερώσεις
                </p>
            </div>

            <div className="relative">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder={`Αναζητήστε διεύθυνση στον δήμο ${city.name}...`}
                            className="pl-10 py-5"
                            value={inputValue}
                            onChange={handleInputChange}
                        />
                        {isLoading && (
                            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                            </div>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                            setInputValue('');
                            setError(null);
                        }}
                        className={`${inputValue ? 'visible' : 'invisible'}`}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {error && (
                    <div className="mt-2 text-sm flex items-center gap-1 text-red-500">
                        <AlertCircle className="h-4 w-4" />
                        <p>{error}</p>
                    </div>
                )}

                {suggestions.length > 0 && (
                    <div className="absolute z-10 mt-2 w-full bg-white rounded-md shadow-lg max-h-60 overflow-auto">
                        <ul className="py-2">
                            {suggestions.map((suggestion) => (
                                <li
                                    key={suggestion.id}
                                    className="px-4 py-3 hover:bg-gray-100 cursor-pointer flex items-center gap-3"
                                    onClick={() => handleSelectLocation(suggestion)}
                                >
                                    <MapPin className="h-4 w-4 text-gray-500 flex-shrink-0" />
                                    <span className="line-clamp-2">{suggestion.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {selectedLocations.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                    {selectedLocations.map((location) => (
                        <div
                            key={location.id}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-sm"
                        >
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate max-w-[150px]">{location.text}</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 p-0 hover:bg-gray-200 rounded-full flex-shrink-0"
                                onClick={() => onRemove(location.id)}
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
} 