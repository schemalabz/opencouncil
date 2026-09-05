"use server"

import axios from 'axios';
import { env } from '@/env.mjs';
import { cacheHas, cacheSetJSON } from '@/lib/cache/valkey';
import { sendErrorAdminAlert } from '@/lib/discord';
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

// One alert per status per hour. A dead key fails on every debounced keystroke
// of every visitor, and processFilters geocodes once per candidate city, so an
// unthrottled alert would bury the channel. The window still repeats while the
// outage lasts, because one message at 02:00 on a Saturday is easy to miss.
const ALERT_TTL_SECONDS = 60 * 60;
const ALERT_INTERVAL_MS = ALERT_TTL_SECONDS * 1000;

// A local gate first, so a dead key does not make a Valkey round trip on every
// keystroke. The shared marker below is what holds the window across instances.
const lastAlertedAt = new Map<string, number>();

async function alertOnPlacesOutage(
    operation: 'suggestions' | 'details',
    status: string,
    errorMessage?: string
): Promise<void> {
    if (!ALERTING_STATUSES.has(status)) return;

    const now = Date.now();
    const previous = lastAlertedAt.get(status);
    if (previous !== undefined && now - previous < ALERT_INTERVAL_MS) return;
    // Hold the local gate before the await so concurrent requests in this
    // process do not all reach Discord at once. Released below if the send
    // fails, so a Discord outage never buys silence about a Google one.
    lastAlertedAt.set(status, now);

    const message = `Google Places ${operation} returned ${status}${errorMessage ? `: ${errorMessage}` : ''}. Address search is down.`;

    // Match search/hits.ts: keep preview and local runs out of the team channel.
    // Production is also the only environment that writes the marker below, so
    // that key cannot collide across environments.
    if (env.DEPLOYMENT_ENV !== 'production') {
        console.warn(`[Places] ${message}`);
        return;
    }

    // Production runs several instances, so the local gate alone lets each one
    // alert. This marker makes the window shared, matching the dedup markers in
    // tasks/pollLivestreams.ts. cacheHas returns false when Valkey is unset or
    // down, which fails toward alerting: a duplicate message beats a missed
    // outage. The check and the write are not atomic, so two instances can race
    // and both alert. That is the same acceptable cost.
    const dedupKey = `oc:places:outage-alert:${status}`;
    if (await cacheHas(dedupKey)) return;

    const delivered = await sendErrorAdminAlert({
        source: 'Google Places',
        error: message,
        context: { operation, status },
    });

    // Suppress the next hour only once the alert is actually out. Discord
    // swallows its own delivery failures, so writing the marker first would
    // silence every instance for an hour over an outage nobody heard about.
    if (!delivered) {
        lastAlertedAt.delete(status);
        return;
    }

    await cacheSetJSON(dedupKey, 1, ALERT_TTL_SECONDS);
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

        // Pass the Google status through rather than collapsing it into an
        // error string. The caller needs it: it picks the user-facing message
        // (LocationSelector reads REQUEST_DENIED and OVER_QUERY_LIMIT), and it
        // decides whether this is an outage. A failed Result now means that
        // this action failed, not that Google refused the request.
        if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            console.error('Google Places API returned non-OK status:', response.data.status);
            await alertOnPlacesOutage('suggestions', response.data.status, response.data.error_message);
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
            await alertOnPlacesOutage('details', response.data.status, response.data.error_message);
        }

        return createSuccess(response.data);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching place details:', error);
        return createError(`Failed to fetch place details: ${errorMessage}`);
    }
} 