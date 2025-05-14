"use server"

import axios from 'axios';

// The radius to use for location-based search, in meters (40km)
const SEARCH_RADIUS = 40000;

// Error response type
type ErrorResponse = {
    status: 'ERROR' | string;
    error: string;
    predictions?: [];
    result?: null;
};

/**
 * Server action to get place suggestions from Google Places API
 */
export async function getPlaceSuggestions(data: {
    input: string;
    cityName?: string;
    location?: string; // Format: "lat,lng"
}) {
    const { input, cityName, location } = data;

    if (!input) {
        return {
            status: 'ERROR',
            error: 'Input parameter is required',
            predictions: []
        } as ErrorResponse;
    }

    try {
        // Make sure we have a Google API key
        if (!process.env.GOOGLE_API_KEY) {
            console.error('Google API key is not defined');
            return {
                status: 'ERROR',
                error: 'API configuration error',
                predictions: []
            } as ErrorResponse;
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
                components: 'country:gr',
                language: 'el',
                key: process.env.GOOGLE_API_KEY,
                ...locationParams
            },
            timeout: 5000 // Set timeout to 5 seconds
        });
        console.log('Response status:', response.data.status);

        // If Google API returned an error, provide helpful error message
        if (response.data.status !== 'OK') {
            console.error('Google Places API returned non-OK status:', response.data.status);
            return {
                status: response.data.status,
                error: `Google API error: ${response.data.status}${response.data.error_message ? ': ' + response.data.error_message : ''}`,
                predictions: []
            } as ErrorResponse;
        }

        return response.data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching place suggestions:', error);

        // Return a structured error response
        return {
            status: 'ERROR',
            error: `Failed to fetch place suggestions: ${errorMessage}`,
            predictions: []
        } as ErrorResponse;
    }
}

/**
 * Server action to get place details from Google Places API
 */
export async function getPlaceDetails(data: { placeId: string }) {
    const { placeId } = data;

    if (!placeId) {
        return {
            status: 'ERROR',
            error: 'placeId parameter is required',
            result: null
        } as ErrorResponse;
    }

    try {
        // Make sure we have a Google API key
        if (!process.env.GOOGLE_API_KEY) {
            console.error('Google API key is not defined');
            return {
                status: 'ERROR',
                error: 'API configuration error',
                result: null
            } as ErrorResponse;
        }

        const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
            params: {
                place_id: placeId,
                fields: 'geometry,formatted_address,name,address_components',
                language: 'el',
                key: process.env.GOOGLE_API_KEY
            },
            timeout: 5000 // Set timeout to 5 seconds
        });

        if (response.data.status !== 'OK') {
            console.error('Google Places Details API returned non-OK status:', response.data.status);
            return {
                status: response.data.status,
                error: `Google API error: ${response.data.status}${response.data.error_message ? ': ' + response.data.error_message : ''}`,
                result: null
            } as ErrorResponse;
        }

        return response.data;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching place details:', error);

        // Return a structured error response
        return {
            status: 'ERROR',
            error: `Failed to fetch place details: ${errorMessage}`,
            result: null
        } as ErrorResponse;
    }
} 