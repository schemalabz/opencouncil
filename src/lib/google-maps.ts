import posthog from 'posthog-js';
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

type PlacesOperation = 'suggestions' | 'details';

// The fields of a Google autocomplete prediction that this module reads. The
// server action passes Google's body through untyped, so this is the contract
// the mapping below relies on.
type PlacePrediction = {
    place_id: string;
    description: string;
};

// One PostHog report per distinct failure per page load. getPlaceSuggestions
// runs on every debounced keystroke, so an outage that lasts a session sends
// one exception per keypress without this. The set stays empty on the server,
// where the guard below returns first.
const reportedPlacesFailures = new Set<string>();

/**
 * Log a Google Places failure and report it to PostHog.
 *
 * These failures never throw: the server action returns a Result, and the
 * functions below turn it into an empty list or null. Nothing reaches
 * window.onerror, so PostHog's exception autocapture never sees them. An
 * expired API key broke the notification signup with no trace in PostHog.
 *
 * PostHog is initialised only when the project token is set and outside embed
 * routes, so the guard follows the analytics helpers (captureHighlight,
 * SubjectReadTracker). It also swallows every server-side call, where this
 * module runs for search filter extraction and PostHog never loads. The
 * console line runs before the guard, so those failures still reach the server
 * log.
 *
 * Nothing in here throws. The callers report from inside their own try block,
 * where a throw becomes a caught network error and mislabels the failure.
 */
function reportPlacesFailure(operation: PlacesOperation, cause: unknown, status?: string): void {
    console.error(`Google Places ${operation} failed${status ? ` (${status})` : ''}:`, cause);
    try {
        if (!posthog.__loaded) return;

        const description = cause instanceof Error ? cause.message : String(cause);
        const key = `${operation}:${status ?? ''}:${description}`;
        if (reportedPlacesFailures.has(key)) return;
        reportedPlacesFailures.add(key);

        const error = cause instanceof Error
            ? cause
            : new Error(`Google Places ${operation} failed: ${description}`);
        posthog.captureException(error, {
            ...(status && { places_status: status }),
            places_operation: operation
        });
    } catch (reportingError) {
        console.error('Failed to report a Google Places failure:', reportingError);
    }
}

/**
 * Get place suggestions based on input text
 * Uses location-based search to restrict results to the selected city area
 */
export async function getPlaceSuggestions(
    input: string,
    cityName?: string,
    cityCoordinates?: [number, number], // In format [lng, lat]
    geocoding?: { country: string; language: string } // Country/language restriction (defaults to Greece server-side)
): Promise<PlaceSuggestionsResult> {
    if (!input || input.trim().length < 2) {
        return { data: [] };
    }

    try {
        // Call the server action with the appropriate parameters
        const result = await fetchPlaceSuggestions({
            input: input.trim(),
            cityName,
            ...(geocoding && { country: geocoding.country, language: geocoding.language }),
            // Pass coordinates if available (format: "lat,lng")
            ...(cityCoordinates && {
                location: `${cityCoordinates[1]},${cityCoordinates[0]}`, // Convert [lng, lat] to "lat,lng"
            })
        });

        // Check if the server action failed
        if (!result.success) {
            reportPlacesFailure('suggestions', result.error);
            return {
                data: [],
                error: {
                    type: 'API_ERROR',
                    message: result.error,
                    status: 'UNKNOWN'
                }
            };
        }

        const response = result.data;

        // Check for Google API error status (ZERO_RESULTS is not an error)
        if (response.status !== 'OK') {
            // ZERO_RESULTS is not an error, it's a valid response with no results
            if (response.status === 'ZERO_RESULTS') {
                return { data: [] };
            }

            // Google names the field error_message, and sends it only for some
            // statuses (REQUEST_DENIED carries the reason, OVER_QUERY_LIMIT does not).
            const message = `Google API error: ${response.status}${response.error_message ? `: ${response.error_message}` : ''}`;
            reportPlacesFailure('suggestions', message, response.status);
            return {
                data: [],
                error: {
                    type: 'API_ERROR',
                    message,
                    status: response.status
                }
            };
        }

        // Check if we have valid predictions
        if (Array.isArray(response.predictions)) {
            const predictions: PlacePrediction[] = response.predictions;
            const suggestions = predictions.map((prediction) => ({
                id: prediction.place_id,
                placeId: prediction.place_id,
                text: prediction.description
            }));
            return { data: suggestions };
        }

        // An OK status with no prediction list is indistinguishable from a real
        // empty result for the caller, so report it rather than let it pass as
        // "no matches in this municipality".
        reportPlacesFailure('suggestions', 'Predictions missing in place suggestions', response.status);
        return { data: [] };
    } catch (error) {
        reportPlacesFailure('suggestions', error);
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
export async function getPlaceDetails(placeId: string, language?: string): Promise<{ text: string; coordinates: [number, number] } | null> {
    if (!placeId) {
        return null;
    }

    try {
        // Call the server action to get place details
        const result = await fetchPlaceDetails({ placeId, ...(language && { language }) });

        // Check if the server action failed
        if (!result.success) {
            reportPlacesFailure('details', result.error);
            return null;
        }

        const response = result.data;

        // Check for Google API error status
        if (response.status !== 'OK') {
            const message = `Google API error: ${response.status}${response.error_message ? `: ${response.error_message}` : ''}`;
            reportPlacesFailure('details', message, response.status);
            return null;
        }

        // An OK status does not guarantee a body, and the server action passes
        // the response through without reading it, so an empty result reaches
        // this point.
        if (!response.result) {
            reportPlacesFailure('details', 'Result missing in place details');
            return null;
        }

        const { formatted_address, geometry } = response.result;

        if (!geometry || !geometry.location) {
            reportPlacesFailure('details', 'Location geometry missing in place details');
            return null;
        }

        // Google omits formatted_address for some place types. Returning it
        // unchecked puts `text: undefined` behind a `text: string` type, and the
        // caller stores that as the location's label.
        if (!formatted_address) {
            reportPlacesFailure('details', 'Formatted address missing in place details');
            return null;
        }

        return {
            text: formatted_address,
            coordinates: [geometry.location.lng, geometry.location.lat]
        };
    } catch (error) {
        reportPlacesFailure('details', error);
        return null;
    }
} 