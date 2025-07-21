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
        userProvidedText?: string;
    } = {}
): Promise<CityCreatorResult> {
    const { useWebSearch = true, webSearchMaxUses = 10, userProvidedText } = options;

    const systemPrompt = `You are an expert municipal government researcher tasked with extracting comprehensive information about Greek city councils by searching the web. Your mission is to generate accurate, real data about municipal governance structures.

CORE MISSION: NEVER REFUSE TO PROVIDE DATA
- You MUST ALWAYS return valid JSON, even if information is incomplete
- NEVER say "I cannot find information" - always provide what you can find
- It is ALWAYS better to provide partial data than no data
- If you find even 1 council member, create a complete structure around them
- Missing fields should be null, never skip entire records

SEARCH STRATEGY FOR MAXIMUM DATA COLLECTION:
1. Start with multiple search approaches simultaneously
2. Use these Greek search patterns systematically:
   - "{cityName} δημοτικό συμβούλιο " (current council)
   - "{cityName} δήμαρχος αντιδήμαρχοι" (mayor and deputies)
   - "{cityName} δημοτικοί σύμβουλοι λίστα" (councilor list)
   - "{cityName} δημοτικές παρατάξεις" (municipal parties)
3. Try alternative spellings and historical searches if current data is limited
4. Search for meeting minutes, press releases, official announcements
5. Look for party websites, candidate lists, election coverage

DATA QUALITY STANDARDS:
1. Generate ONLY valid JSON that matches the provided schema exactly
2. Use real data from web searches - never fabricate information
3. Greek municipal councils typically have 15-41 members - aim for completeness
4. For missing information, use null values (not empty strings)
5. Bilingual names can be inferred/translated if only one language is available
6. Always provide at least basic required fields (name, name_en, name_short, name_short_en)
7. For optional fields, use null if not available
8. For roles: always specify type, use null for name/name_en if it's simple membership
9. For names: use the conventional form (not all caps, first name first). The short name for e.g. Έφη Σπυροπούλου is Ε. Σπυροπούλου.
10. For party names: Avoid all-caps names. The english name should be greeklish (e.g. for Λαϊκή Συσπείρωση, Laiki Syspirosi).

RESPONSE REQUIREMENTS:
- Return ONLY the JSON data structure
- No explanations, no markdown formatting, no additional text
- Even if you find minimal information, structure it properly in the full schema

JSON SCHEMA TO MATCH:
${JSON.stringify(citySchemaJson, null, 2)}`;

    const userPrompt = `TARGET MUNICIPALITY: "${cityName}" (ID: ${cityId})

${userProvidedText ? `USER-PROVIDED DATA:
The user has provided the following text that contains information about this municipality. Use this as your PRIMARY data source and supplement with web search as needed:

---
${userProvidedText}
---

Please extract all relevant information from this text, including names of council members, parties, roles, etc. This user-provided data should be prioritized over web search results where there are conflicts. Yet, people should be deduplicated, and their names should appear in the conventional form (not all caps, first name first).

` : ''}${useWebSearch ? `COMPREHENSIVE SEARCH PROTOCOL:
Execute these searches systematically to maximize data collection:

PRIMARY SEARCHES (try all of these):
1. "${cityName} δημοτικό συμβούλιο μέλη 2024"
2. "${cityName} δημοτικές εκλογές 2023 αποτελέσματα"
3. "${cityName} δήμαρχος ${new Date().getFullYear()}"
4. "${cityName} αντιδήμαρχοι λίστα"
5. "${cityName} δημοτικές παρατάξεις"
6. "${cityName} δημοτικοί σύμβουλοι ονόματα"

SECONDARY SEARCHES (if primary data is limited):
7. "${cityName} δημοτικό συμβούλιο 2023"
8. "${cityName} δημοτική αρχή μέλη"
9. "${cityName} εκλογές 2023 υποψήφιοι"
10. "δήμος ${cityName} συμβούλιο"

FALLBACK SEARCHES (for historical data):
11. "${cityName} δημοτικό συμβούλιο 2019-2023"
12. "${cityName} προηγούμενο συμβούλιο"

TARGET INFORMATION:
- Current mayor and full name
- All deputy mayors (αντιδήμαρχοι) with their portfolios
- Complete list of municipal councilors (δημοτικοί σύμβουλοι)
- Municipal parties/coalitions (δημοτικές παρατάξεις) - NOT national parties
- Party leaders and member assignments
- Council leadership (president, secretary, etc.)` : ''}

MUNICIPAL STRUCTURE TO CREATE:

1. **PARTIES SECTION**:
   - Municipal parties/coalitions that won seats in the council
   - Typically 3-8 parties depending on municipality size
   - Use actual party names, not national party names
   - Include party colors if available from election materials

2. **ADMINISTRATIVE BODIES SECTION**:
   - Create exactly one body: "Δημοτικό Συμβούλιο" / "Municipal Council" (type: "council")

3. **PEOPLE SECTION**:
   - Mayor + all deputy mayors + all municipal councilors
   - Greek councils range from 15 members (small) to 41 members (large cities)
   - Include ALL people you find - don't limit arbitrarily

ROLE ASSIGNMENT LOGIC:
Each person gets specific roles in their "roles" array:

**Council Members**: 
- Role type "adminBody" connecting to "Δημοτικό Συμβούλιο"
- Role name is null for regular members
- Role name is "Πρόεδρος"/"President" for council president
- Role name is "Γραμματέας"/"Secretary" for council secretary

**Party Members**:
- Role type "party" connecting to their municipal party
- Role name is null for regular party members  
- Role name is "Επικεφαλής"/"Leader" for party leaders

**City Officials**:
- Role type "city" with specific titles:
  - "Δήμαρχος"/"Mayor"
  - "Αντιδήμαρχος Οικονομικών"/"Deputy Mayor of Finance"
  - "Αντιδήμαρχος Τεχνικών Υπηρεσιών"/"Deputy Mayor of Technical Services"
  - etc. (use actual portfolios found)

**Independents**: 
- Have adminBody role for council membership
- Have city role if they're mayor/deputy mayor
- NO party role

DATA COMPLETION REQUIREMENTS:
- NEVER skip a person because information is incomplete
- If you find someone's name but not their party → include them with partyName: null
- If you find a party but not all members → include the party and whatever members you find
- If you find only partial names → use what you have and make reasonable short versions
- If you find only Greek names → translate to English as best you can
- If you find only English names → transliterate to Greek

MINIMUM SUCCESS CRITERIA:
Even if searches yield limited results, you MUST provide:
- At least the mayor (if you can find their name)
- At least 1-2 council members (if you can find any)
- At least 1 party (even if it's "Δημοτική Παράταξη" as a generic party)
- At leaast a few simple council members ("Δημοτικοί σύμβουλοι")
- The "Δημοτικό Συμβούλιο" administrative body

Remember: Partial accurate data is infinitely better than no data. Greek municipalities are well-documented online - with systematic searching you should find substantial information.
We care about all Δημοτικοί Σύμβουλοι, not just deputy mayors and heads of parties.

Generate the complete JSON structure now:`;

    const config: Partial<AIConfig> = {
        maxTokens: 16384,
        temperature: 0,
        enableWebSearch: useWebSearch,
        webSearchMaxUses,
    };

    try {
        console.log(`[AI City Creator] Generating data for ${cityName} (${cityId})`);
        console.log(`[AI City Creator] Web search enabled: ${useWebSearch}`);
        console.log(`[AI City Creator] User-provided text: ${userProvidedText ? `${userProvidedText.length} characters` : 'none'}`);

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