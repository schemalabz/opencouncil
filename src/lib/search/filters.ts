import { ExtractedFilters } from './types';
import { aiChat } from '@/lib/ai';
import { getCities } from '@/lib/db/cities';
import { getCitiesWithGeometry } from '@/lib/db/cities';
import { getPlaceSuggestions, getPlaceDetails } from '@/lib/google-maps';
import { calculateGeometryBounds } from '@/lib/utils';
import { Location } from './types';

// Define the system prompt for filter extraction
const FILTER_EXTRACTION_PROMPT = `Εξαγωγή Φίλτρων Αναζήτησης

Είστε ένας βοηθός εξαγωγής φίλτρων. Η δουλειά σας είναι να αναλύετε ερωτήσεις αναζήτησης και να εξάγετε σχετικά φίλτρα.
Επιστρέψτε ΜΟΝΟ ένα αντικείμενο JSON με την ακόλουθη δομή:
{
    "cityIds": string[] | null,
    "dateRange": { start: string, end: string } | null,
    "isLatest": boolean | null,
    "locationName": string | null
}

Κανόνες:
1. Συμπεριλάβετε μόνο φίλτρα που αναφέρονται ρητά ή σιωπηρά στην ερώτηση
2. Για ημερομηνίες, χρησιμοποιήστε μορφή ISO 8601
3. Για τα IDs των πόλεων, χρησιμοποιήστε τα ακριβή IDs από τη λίστα πόλεων
4. Για τοποθεσίες, εξάγετε μόνο το όνομα της τοποθεσίας (π.χ., "Πλατεία Συντάγματος", "Εθνικός Κήπος")
5. Επιστρέψτε null (όχι undefined) για οποιοδήποτε φίλτρο δεν βρέθηκε
6. Για ερωτήσεις "τελευταία", ορίστε isLatest σε true και συμπεριλάβετε το σχετικό cityId
7. Σημερινή ημερομηνία: {{TODAY_DATE}}

Διαθέσιμες πόλεις:
{{CITIES_LIST}}`;

// Get cities for the prompt
async function getCitiesForPrompt(): Promise<{ id: string; name: string; name_en: string }[]> {
    const cities = await getCities();
    return cities.map(city => ({
        id: city.id,
        name: city.name,
        name_en: city.name_en
    }));
}

// Extract filters using AI
export async function extractFilters(query: string): Promise<ExtractedFilters> {
    // Get cities for the prompt
    const cities = await getCitiesForPrompt();

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

    const { result } = await aiChat<ExtractedFilters>(prompt, query);
    return result;
}

// Resolve location coordinates
export async function resolveLocationCoordinates(locationName: string, cityId: string): Promise<Location | undefined> {
    try {
        // Get city with geometry directly
        const citiesWithGeometry = await getCitiesWithGeometry([{ id: cityId } as any]);
        const cityWithGeometry = citiesWithGeometry[0];

        if (!cityWithGeometry) {
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
            radius: 40000 // Using the same radius as in actions.ts
        };
    } catch (error) {
        console.error('[Location] Error resolving location coordinates:', error);
        return undefined;
    }
}

// Process extracted filters and resolve locations
export async function processFilters(extractedFilters: ExtractedFilters): Promise<{
    cityIds: string[] | undefined;
    dateRange: { start: string; end: string; } | undefined;
    locations: Location[] | undefined;
}> {
    let locations: Location[] = [];

    // Resolve location coordinates if a location name was extracted
    if (extractedFilters.locationName) {
        const locationName = extractedFilters.locationName;
        if (extractedFilters.cityIds?.[0]) {
            // If we have a specific city, try that first
            const location = await resolveLocationCoordinates(
                locationName,
                extractedFilters.cityIds[0]
            );
            if (location) {
                locations.push(location);
            }
        } else {
            // If no specific city, try all cities
            const cities = await getCities();

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
