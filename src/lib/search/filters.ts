import { z } from 'zod';
import { Realm } from '@prisma/client';
import { ExtractedFilters } from './types';
import { aiChat } from '@/lib/ai';
import { getCities, filterCityIdsByRealm } from '@/lib/db/cities';
import { getCity } from '@/lib/db/cities';
import { getPlaceSuggestions, getPlaceDetails } from '@/lib/google-maps';
import { calculateGeometryBounds } from '@/lib/geo';
import { Location } from './types';

// Radius of the proximity boost applied to subjects pinned near an AI-extracted
// location (see buildLocationClauses).
//
// Sized to the scale of what `locationName` actually holds: the extraction
// prompt asks for a single place name and gives landmark examples ("Πλατεία
// Συντάγματος", "Εθνικός Κήπος"), and the municipality is already handled by
// the separate cityIds filter, so the value is always a sub-city feature — a
// square, a park, a street, a neighbourhood.
//
// 2km is the radius the landing page's address search already uses for the same
// job (ADDRESS_RADIUS_KM in useFilteredSubjects.ts); the MCP list_nearby_subjects
// tool defaults to 1km. Not imported from either: one is a client UI hook and
// the other a tool default, so they are free to diverge from search ranking.
//
// This replaces the 40km SEARCH_RADIUS copied from actions.ts, which is a
// Google Places geocoding bias — a different job. At 40km the boost covered the
// whole Attica basin, so nearly every pinned subject in an Attica city received
// it and proximity did not discriminate.
const LOCATION_BOOST_RADIUS_METERS = 2000;

// Define the system prompt for filter extraction
const FILTER_EXTRACTION_PROMPT = `Εξαγωγή Φίλτρων Αναζήτησης

Είστε ένας βοηθός εξαγωγής φίλτρων. Η δουλειά σας είναι να αναλύετε ερωτήσεις αναζήτησης και να εξάγετε σχετικά φίλτρα.
Επιστρέψτε ΜΟΝΟ ένα αντικείμενο JSON με την ακόλουθη δομή:
{
    "cityIds": string[] | null,
    "dateRange": { start: string, end: string } | null,
    "locationName": string | null
}

Κανόνες:
1. Συμπεριλάβετε μόνο φίλτρα που αναφέρονται ρητά ή σιωπηρά στην ερώτηση
2. Για ημερομηνίες, χρησιμοποιήστε μορφή ISO 8601
3. Για τα IDs των πόλεων, χρησιμοποιήστε τα ακριβή IDs από τη λίστα πόλεων
4. Για τοποθεσίες, εξάγετε μόνο το όνομα της τοποθεσίας (π.χ., "Πλατεία Συντάγματος", "Εθνικός Κήπος")
5. Επιστρέψτε null (όχι undefined) για οποιοδήποτε φίλτρο δεν βρέθηκε
6. Σημερινή ημερομηνία: {{TODAY_DATE}}

Διαθέσιμες πόλεις:
{{CITIES_LIST}}`;

/** Every filter absent. The neutral result of the extraction step. */
export const NO_EXTRACTED_FILTERS: ExtractedFilters = {
    cityIds: null,
    dateRange: null,
    locationName: null,
};

/**
 * Validates the model's JSON against the shape the prompt asks for.
 *
 * `aiChat` parses the response and casts it, so before this schema the
 * `ExtractedFilters` type stated what the prompt REQUESTS, not what arrives. A
 * field of the wrong type used to be inert, because every consumer only tested
 * it for truthiness. It is not inert any more: buildSearchQuery reads
 * locationName as a string (spellingsOf calls String.replace on it), so an
 * array there throws. That call sits OUTSIDE the two try/catch blocks in
 * src/lib/search/index.ts that keep a failed extraction non-fatal, so one bad
 * field returned a 500 for a query the lexical clauses could answer.
 *
 * Each field catches on its own, so a malformed field drops to null and the
 * rest of the extraction survives. The outer catch covers a response that is
 * not an object at all.
 */
const extractedFiltersSchema = z.object({
    cityIds: z.array(z.string()).nullable().catch(null),
    dateRange: z.object({ start: z.string(), end: z.string() }).nullable().catch(null),
    locationName: z.string().nullable().catch(null),
}).catch(NO_EXTRACTED_FILTERS);

// Get cities for the prompt. Realm-scoped: a city the search cannot return is a
// city the model must not be able to name, or it answers "Παρίσι" on
// opencouncil.gr with a filter that empties the results.
async function getCitiesForPrompt(realm: Realm): Promise<{ id: string; name: string; name_en: string }[]> {
    const cities = await getCities({}, realm);
    return cities.map(city => ({
        id: city.id,
        name: city.name,
        name_en: city.name_en
    }));
}

// Extract filters using AI
export async function extractFilters(query: string, realm: Realm): Promise<ExtractedFilters> {
    // Get cities for the prompt
    const cities = await getCitiesForPrompt(realm);

    // Format cities list for the prompt
    const citiesList = cities.map(city =>
        `- ${city.name} (${city.name_en}): ${city.id}`
    ).join('\n');

    // Get today's date in ISO format
    const today = new Date().toISOString().split('T')[0];

    // Create the prompt with cities list and today's date
    const prompt = FILTER_EXTRACTION_PROMPT
        .replace('{{CITIES_LIST}}', citiesList)
        .replace('{{TODAY_DATE}}', today);

    const { result } = await aiChat<unknown>(prompt, query);
    return extractedFiltersSchema.parse(result);
}

// Resolve location coordinates
export async function resolveLocationCoordinates(locationName: string, cityId: string): Promise<Location | undefined> {
    try {
        // Get city with geometry
        const cityWithGeometry = await getCity(cityId, { includeGeometry: true });

        if (!cityWithGeometry || !cityWithGeometry.geometry) {
            return undefined;
        }

        // Calculate city center from geometry
        const { center } = calculateGeometryBounds(cityWithGeometry.geometry);

        // Get place suggestions with city center
        const result = await getPlaceSuggestions(locationName, cityWithGeometry.name, center);

        // Check for API errors
        if (result.error) {
            console.error('[Location] API error getting place suggestions:', result.error);
            return undefined;
        }

        if (result.data.length === 0) {
            return undefined;
        }

        // Get details for the first suggestion
        const details = await getPlaceDetails(result.data[0].placeId);
        if (!details) {
            return undefined;
        }

        // Convert coordinates to the expected format
        return {
            point: {
                lat: details.coordinates[1],
                lon: details.coordinates[0]
            },
            radiusMeters: LOCATION_BOOST_RADIUS_METERS
        };
    } catch (error) {
        console.error('[Location] Error resolving location coordinates:', error);
        return undefined;
    }
}

// Process extracted filters and resolve locations
export async function processFilters(extractedFilters: ExtractedFilters, realm: Realm): Promise<{
    cityIds: string[] | undefined;
    dateRange: { start: string; end: string; } | undefined;
    locations: Location[] | undefined;
}> {
    let locations: Location[] = [];

    // Resolve location coordinates if a location name was extracted
    if (extractedFilters.locationName) {
        const locationName = extractedFilters.locationName;
        // The model reads a realm-scoped city list but can still name anything,
        // and getCity() applies no realm filter of its own. Cap the id here too,
        // so the one caller-influenced id that reaches the database on this path
        // cannot bias the geocode with a municipality of another realm.
        const [extractedCityId] = extractedFilters.cityIds?.length
            ? await filterCityIdsByRealm(extractedFilters.cityIds, realm)
            : [];
        if (extractedCityId) {
            // If we have a specific city, try that first
            const location = await resolveLocationCoordinates(
                locationName,
                extractedCityId
            );
            if (location) {
                locations.push(location);
            }
        } else {
            // If no specific city, try every city of the realm
            const cities = await getCities({}, realm);

            // Try each city and collect all matches
            const locationPromises = cities.map(async (city) => {
                const location = await resolveLocationCoordinates(
                    locationName,
                    city.id
                );
                return location;
            });

            const results = await Promise.all(locationPromises);
            locations = results.filter((loc): loc is Location => loc !== undefined);
        }
    }

    return {
        cityIds: extractedFilters.cityIds || undefined,
        dateRange: extractedFilters.dateRange || undefined,
        locations: locations.length > 0 ? locations : undefined
    };
}
