"use server"

import axios from 'axios';
import { env } from '@/env.mjs';
import { Result, createSuccess, createError } from '@/lib/result';

// The radius to use for location-based search, in meters (40km)
const SEARCH_RADIUS = 40000;

/**
 * Server action to get place suggestions from Google Places API
 */
export async function getPlaceSuggestions(data: {
    input: string;
    cityName?: string;
    location?: string; // Format: "lat,lng"
    country?: string;  // ISO 3166-1 country to restrict results to (defaults to Greece)
    language?: string; // Response language (defaults to Greek)
}): Promise<Result<any>> {
    const { input, cityName, location, country = 'gr', language = 'el' } = data;

    if (!input) {
        return createError('Input parameter is required');
    }

    try {
        // Make sure we have a Google API key
        if (!env.GOOGLE_API_KEY) {
            console.error('Google API key is not defined');
            return createError('API configuration error');
        }

        // Use location-based search if coordinates are provided, otherwise fall back to text
        let searchInput = input;
        let locationParams = {};

        if (location) {
            // If we have coordinates, use them with the fixed radius
            locationParams = {
                location,
                radius: SEARCH_RADIUS
            };
            console.log('Using location-based search:', locationParams);
        } else if (cityName) {
            // Fall back to adding city name to the input if no coordinates
            searchInput = `${input}, ${cityName}`;
            console.log('Using text-based search:', searchInput);
        }

        console.log('Search input:', searchInput);
        const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
            params: {
                input: searchInput,
                components: `country:${country}`,
                language,
                key: env.GOOGLE_API_KEY,
                ...locationParams
            },
            timeout: 5000 // Set timeout to 5 seconds
        });
        console.log('Response status:', response.data.status);

        // Pass the Google status through instead of collapsing it into an
        // error. The caller needs the status: it selects the user-facing
        // message (REQUEST_DENIED and OVER_QUERY_LIMIT read differently) and it
        // tags the PostHog report. A failed Result now means that this action
        // failed, not that Google refused the request.
        //
        // ZERO_RESULTS is a valid empty answer, so it is not logged.
        if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            console.error('Google Places API returned non-OK status:', response.data.status);
        }

        return createSuccess(response.data);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching place suggestions:', error);
        return createError(`Failed to fetch place suggestions: ${errorMessage}`);
    }
}

/**
 * Server action to get place details from Google Places API
 */
export async function getPlaceDetails(data: { placeId: string; language?: string }): Promise<Result<any>> {
    const { placeId, language = 'el' } = data;

    if (!placeId) {
        return createError('placeId parameter is required');
    }

    try {
        // Make sure we have a Google API key
        if (!env.GOOGLE_API_KEY) {
            console.error('Google API key is not defined');
            return createError('API configuration error');
        }

        const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
            params: {
                place_id: placeId,
                fields: 'geometry,formatted_address,name,address_components',
                language,
                key: env.GOOGLE_API_KEY
            },
            timeout: 5000 // Set timeout to 5 seconds
        });

        // Pass the status through, for the same reason as getPlaceSuggestions.
        if (response.data.status !== 'OK') {
            console.error('Google Places Details API returned non-OK status:', response.data.status);
        }

        return createSuccess(response.data);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching place details:', error);
        return createError(`Failed to fetch place details: ${errorMessage}`);
    }
} 