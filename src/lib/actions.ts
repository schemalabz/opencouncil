"use server"

import { env } from '@/env.mjs';
import { sendErrorAdminAlert } from '@/lib/discord-core';
import { Result, createSuccess, createError } from '@/lib/result';

// The radius to use for location-based search, in meters (40km)
const SEARCH_RADIUS = 40000;

// Google answers 200 with the failure in a status field, so a dead API key
// throws nowhere in the stack. onRequestError never fires, the address field
// just stops returning results, and the notification signup breaks in silence.
// An expired key did exactly that in production.
//
// These two statuses mean the integration itself is down, not that the query
// found nothing. REQUEST_DENIED covers an expired, revoked or restricted key.
const ALERTING_STATUSES = new Set(['REQUEST_DENIED', 'OVER_QUERY_LIMIT']);

/**
 * A GET to the Places API with a 5-second limit. It uses fetch, not axios: an
 * AxiosError prints its request config, with the API key and the text that a
 * reader typed, and a failed fetch names neither.
 */
async function getPlacesJson(endpoint: 'autocomplete' | 'details', params: Record<string, string | number>) {
    const query = new URLSearchParams(Object.entries(params).map(([name, value]) => [name, String(value)]));
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/${endpoint}/json?${query}`, {
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Google Places ${endpoint} answered HTTP ${response.status}`);
    return response.json();
}

async function alertOnPlacesOutage(
    operation: 'suggestions' | 'details',
    status: string,
    errorMessage?: string
): Promise<void> {
    if (!ALERTING_STATUSES.has(status)) return;

    const message = `Google Places ${operation} returned ${status}${errorMessage ? `: ${errorMessage}` : ''}. Address search is down.`;

    // Match search/hits.ts: keep preview and local runs out of the team channel.
    if (env.DEPLOYMENT_ENV !== 'production') {
        console.warn(`[Places] ${message}`);
        return;
    }

    await sendErrorAdminAlert({
        source: 'Google Places',
        error: message,
        context: { operation, status },
    });
}

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
        }

        const data = await getPlacesJson('autocomplete', {
            input: searchInput,
            components: `country:${country}`,
            language,
            key: env.GOOGLE_API_KEY,
            ...locationParams
        });
        console.log('Response status:', data.status);

        // Pass the Google status through rather than collapsing it into an
        // error string. The caller needs it: it picks the user-facing message
        // (LocationSelector reads REQUEST_DENIED and OVER_QUERY_LIMIT), and it
        // decides whether this is an outage. A failed Result now means that
        // this action failed, not that Google refused the request.
        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            console.error('Google Places API returned non-OK status:', data.status);
            await alertOnPlacesOutage('suggestions', data.status, data.error_message);
        }

        return createSuccess(data);
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

        const data = await getPlacesJson('details', {
            place_id: placeId,
            fields: 'geometry,formatted_address,name,address_components',
            language,
            key: env.GOOGLE_API_KEY
        });

        // Pass the status through, for the same reason as getPlaceSuggestions.
        if (data.status !== 'OK') {
            console.error('Google Places Details API returned non-OK status:', data.status);
            await alertOnPlacesOutage('details', data.status, data.error_message);
        }

        return createSuccess(data);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching place details:', error);
        return createError(`Failed to fetch place details: ${errorMessage}`);
    }
} 