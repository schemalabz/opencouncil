import { aiChat, AIConfig } from './ai';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import citySchemaJson from '../../json-schemas/city.schema.json';

// Initialize AJV validator
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateCitySchema = ajv.compile(citySchemaJson);

export interface CityCreatorResult {
    success: boolean;
    data?: any;
    errors?: string[];
    usage?: any;
}

export async function generateCityDataWithAI(
    cityId: string,
    cityName: string,
    options: {
        useWebSearch?: boolean;
        webSearchMaxUses?: number;
    } = {}
): Promise<CityCreatorResult> {
    const { useWebSearch = true, webSearchMaxUses = 10 } = options;

    const systemPrompt = `You are an expert municipal government researcher tasked with extracting information about city council members by searching the web. You must generate accurate, real data about city council members (δημοτικοί σύμβουλοι), the mayor, deputy mayors and party memberships.

CRITICAL REQUIREMENTS:
1. Generate ONLY valid JSON that matches the provided schema exactly.
2. Use real data from the web that is accurate and up to date.
3. Completeness: Include as many council members as you can find.
4. For missing information, use null values (not empty strings).
5. Bilingual names can be inferred or translated if needed.
6. Always provide at least basic required fields (name, name_en, name_short, name_short_en).
7. For optional fields (image, profileUrl, activeFrom, activeTo, partyName), use null if not available.
8. For roles: always specify type, use null for name/name_en if it's simple membership.
9. Better to provide partial but accurate data than to skip people entirely.
10. Do not get lazy! Municipal councils often have 15-30+ members.

JSON SCHEMA TO MATCH:
${JSON.stringify(citySchemaJson, null, 2)}

RESPONSE FORMAT:
Return ONLY the JSON data structure. No explanations, no markdown formatting, no additional text.`;

    const userPrompt = `Research and generate comprehensive data for the city council of city: "${cityName}" (ID: ${cityId}).

${useWebSearch ? `Use web search to find current information about:
- Current mayor, deputy mayors and municipal council members.
- Political parties (δημοτικπές παρατάξεις) active in this municipality -- NOT central political parties.
- Recent municipal elections results

Search for information with queries like "${cityName} δημοτικοί σύμβουλοι", "${cityName} αντιδήμαρχοι", "${cityName} δημοτικό συμβούλιο" to get accurate current data.` : ''}

Generate a complete city council structure including:
1. **Parties**: The parties (δημοτικπές παρατάξεις) present in the city council.
2. **Administrative Bodies**: Create just the Δημοτικό Συμβούλιο (city council).
3. **People**: The people who are members of the city council, with embedded roles for each person.

Each person should have a "roles" array with these types of roles:
1. **Party roles** (type: "party"): indicates that a person is a member of a party (or a head of a party).
2. **Administrative body roles** (type: "adminBody"): indicates that a person is a member of an administrative body. Every member of Δημοτικό Συμβούλιο should have this role.
3. **City-wide roles** (type: "city"): mayor, deputy mayor etc.

So every council member (except the mayor, who technically is not part of the city council) should have an adminBody role with empty name connecting them to the administrative body of the city council.
And everyone -- except for independents -- should have a party role connecting them to the party.
The mayor and deputy mayors should have city roles connecting them to city-wide positions.

ROLES have NULL NAMES (null for both name and name_en) if they are simple "members" -- membership is implied. They only have names like "Αντιδήμαρχος Οικονομικών"/"Deputy Mayor of Finance" or "Πρόεδρος"/"President" if the role is something other than a simple member.

HANDLING MISSING DATA:
- If you can't find party information for someone, set partyName to null
- If someone appears to be independent, don't create a party role for them
- If you can't find exact role titles, use null for role names
- If you can't find images or profile URLs, set them to null
- If you can't find active dates, set them to null
- Always include at least the basic name fields and role types

Ensure all data is:
- Factually accurate and complete.
- Properly formatted with bilingual naming
- Structurally sound with valid relationships
- Complete with all required schema fields.

Do not make up any data -- rely only on web search results.

Generate the JSON structure now:`;

    const config: Partial<AIConfig> = {
        maxTokens: 16384,
        temperature: 0,
        enableWebSearch: useWebSearch,
        webSearchMaxUses,
    };

    try {
        console.log(`[AI City Creator] Generating data for ${cityName} (${cityId})`);
        console.log(`[AI City Creator] Web search enabled: ${useWebSearch}`);

        const result = await aiChat(systemPrompt, userPrompt, undefined, undefined, config);

        console.log(`[AI City Creator] Received response, validating schema...`);

        // Validate against JSON schema
        const isValid = validateCitySchema(result.result);

        if (!isValid) {
            const errors = validateCitySchema.errors?.map(error => {
                return `${error.instancePath || 'root'}: ${error.message}`;
            }) || ['Unknown validation error'];

            console.error(`[AI City Creator] Schema validation failed:`, errors);

            return {
                success: false,
                errors: [
                    'Generated data does not match required schema:',
                    ...errors
                ],
                usage: result.usage
            };
        }

        // Additional business logic validation
        const businessValidation = validateBusinessLogic(result.result);
        if (!businessValidation.valid) {
            console.error(`[AI City Creator] Business logic validation failed:`, businessValidation.errors);

            return {
                success: false,
                errors: [
                    'Generated data failed business logic validation:',
                    ...businessValidation.errors
                ],
                usage: result.usage
            };
        }

        console.log(`[AI City Creator] Validation successful, returning data`);

        // Log data statistics
        const data = result.result as any;
        const totalRoles = data.people?.reduce((count: number, person: any) => {
            return count + (person.roles?.length || 0);
        }, 0) || 0;

        console.log(`[AI City Creator] Generated data statistics:`);
        console.log(`  - Parties: ${data.parties?.length || 0}`);
        console.log(`  - People: ${data.people?.length || 0}`);
        console.log(`  - Administrative Bodies: ${data.administrativeBodies?.length || 0}`);
        console.log(`  - Roles (embedded): ${totalRoles}`);

        return {
            success: true,
            data: result.result,
            usage: result.usage
        };

    } catch (error) {
        console.error(`[AI City Creator] Error generating city data:`, error);

        return {
            success: false,
            errors: [
                'Failed to generate city data',
                error instanceof Error ? error.message : String(error)
            ]
        };
    }
}

function validateBusinessLogic(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
        // Validate cityId matches
        if (!data.cityId || typeof data.cityId !== 'string') {
            errors.push('Missing or invalid cityId');
        }

        // Validate parties
        if (!Array.isArray(data.parties) || data.parties.length === 0) {
            errors.push('Must have at least one political party');
        } else {
            data.parties.forEach((party: any, index: number) => {
                if (!party.name || !party.name_en || !party.colorHex) {
                    errors.push(`Party ${index + 1}: Missing required fields`);
                }
                if (party.colorHex && party.colorHex !== null && !/^#[0-9a-fA-F]{6}$/i.test(party.colorHex)) {
                    errors.push(`Party ${index + 1}: Invalid color hex format '${party.colorHex}' - should be #RRGGBB`);
                }
            });
        }

        // Validate administrative bodies
        if (!Array.isArray(data.administrativeBodies) || data.administrativeBodies.length === 0) {
            errors.push('Must have at least one administrative body');
        } else {
            const hasCouncil = data.administrativeBodies.some((body: any) => body.type === 'council');
            if (!hasCouncil) {
                errors.push('Must have at least one council-type administrative body');
            }
        }

        // Validate people
        if (!Array.isArray(data.people) || data.people.length === 0) {
            errors.push('Must have at least one person');
        } else {
            data.people.forEach((person: any, index: number) => {
                if (!person.name || !person.name_en || !person.name_short || !person.name_short_en) {
                    errors.push(`Person ${index + 1}: Missing required name fields`);
                }
            });
        }

        // Validate embedded roles within people
        const partyNames = new Set(data.parties.map((p: any) => p.name));
        const bodyNames = new Set(data.administrativeBodies.map((b: any) => b.name));
        let totalRoles = 0;

        data.people.forEach((person: any, personIndex: number) => {
            if (person.roles && Array.isArray(person.roles)) {
                totalRoles += person.roles.length;
                person.roles.forEach((role: any, roleIndex: number) => {
                    if (!role.type || !['party', 'city', 'adminBody'].includes(role.type)) {
                        errors.push(`Person ${personIndex + 1}, Role ${roleIndex + 1}: Invalid role type '${role.type}'`);
                    }
                    // Only validate party/body references if they're provided (not null)
                    if (role.type === 'party' && role.partyName && role.partyName !== null && !partyNames.has(role.partyName)) {
                        errors.push(`Person ${personIndex + 1}, Role ${roleIndex + 1}: Invalid party reference '${role.partyName}'`);
                    }
                    if (role.type === 'adminBody' && role.administrativeBodyName && role.administrativeBodyName !== null && !bodyNames.has(role.administrativeBodyName)) {
                        errors.push(`Person ${personIndex + 1}, Role ${roleIndex + 1}: Invalid administrative body reference '${role.administrativeBodyName}'`);
                    }
                });
            }
        });

        if (totalRoles === 0) {
            errors.push('Must have at least one role assigned to people');
        }

        return {
            valid: errors.length === 0,
            errors
        };

    } catch (error) {
        return {
            valid: false,
            errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`]
        };
    }
} 