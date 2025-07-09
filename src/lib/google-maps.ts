import { getPlaceSuggestions as fetchPlaceSuggestions, getPlaceDetails as fetchPlaceDetails } from './actions';
import { ApiResult } from '@/lib/result';

// Define types for Google API responses
export type LatLng = {
    lat: number;
    lng: number;
};

export type PlaceSuggestion = {
    id: string;
    text: string;
    placeId: string;
};

// Error type for API failures
export type PlaceSuggestionsError = {
    type: 'API_ERROR' | 'NETWORK_ERROR';
    message: string;
    status?: string;
};

// Result type that can either be suggestions or an error
export type PlaceSuggestionsResult = ApiResult<PlaceSuggestion[], PlaceSuggestionsError>;

/**
 * Get place suggestions based on input text
 * Uses location-based search to restrict results to the selected city area
 */
export async function getPlaceSuggestions(
    input: string,
    cityName?: string,
    cityCoordinates?: [number, number] // In format [lng, lat]
): Promise<PlaceSuggestionsResult> {
    if (!input || input.trim().length < 2) {
        return { data: [] };
    }

    try {
        // Call the server action with the appropriate parameters
        const response = await fetchPlaceSuggestions({
            input: input.trim(),
            cityName,
            // Pass coordinates if available (format: "lat,lng")
            ...(cityCoordinates && {
                location: `${cityCoordinates[1]},${cityCoordinates[0]}`, // Convert [lng, lat] to "lat,lng"
            })
        });

        // Check for error status
        if (response.status !== 'OK') {
            console.error('Error getting place suggestions:', response.error || response.status);

            // ZERO_RESULTS is not an error, it's a valid response with no results
            if (response.status === 'ZERO_RESULTS') {
                return { data: [] };
            }

            return {
                data: [],
                error: {
                    type: 'API_ERROR',
                    message: response.error || `Google API error: ${response.status}`,
                    status: response.status
                }
            };
        }

        // Check if we have valid predictions
        if (response.predictions && Array.isArray(response.predictions)) {
            const suggestions = response.predictions.map((prediction: any) => ({
                id: prediction.place_id,
                placeId: prediction.place_id,
                text: prediction.description
            }));
            return { data: suggestions };
        }

        return { data: [] };
    } catch (error) {
        console.error('Error fetching place suggestions:', error);
        return {
            data: [],
            error: {
                type: 'NETWORK_ERROR',
                message: error instanceof Error ? error.message : 'Network error occurred'
            }
        };
    }
}

/**
 * Get place details from a place ID
 */
export async function getPlaceDetails(placeId: string): Promise<{ text: string; coordinates: [number, number] } | null> {
    if (!placeId) {
        return null;
    }

    try {
        // Call the server action to get place details
        const response = await fetchPlaceDetails({ placeId });

        // Check for error status
        if (response.status !== 'OK') {
            console.error('Error getting place details:', response.error || response.status);
            return null;
        }

        // Check if we have a valid result
        if (response.result && response.status === 'OK') {
            const { formatted_address, geometry } = response.result;

            if (!geometry || !geometry.location) {
                console.error('Location geometry missing in place details');
                return null;
            }

            return {
                text: formatted_address,
                coordinates: [geometry.location.lng, geometry.location.lat]
            };
        }

        return null;
    } catch (error) {
        console.error('Error fetching place details:', error);
        return null;
    }
} 