// A pasted list of the members of a body, read by the model (#829). The
// secretary of a youth council has the list as text, in an email or a
// decision, and types nothing twice. The parser returns the entries as the
// import route takes them; the admin confirms them on the page first.
import "server-only";
import { aiChat } from '@/lib/ai';
import { jsonSchemaOf } from '@/lib/openapi/jsonSchema';
import { rosterParseResultSchema, type RosterEntry } from '@/lib/zod-schemas/bodyMembers';

const RESULT_SCHEMA_JSON = jsonSchemaOf(rosterParseResultSchema);

const SYSTEM_PROMPT = `You read a pasted list of the members of a body of local government (a council, a committee, a youth council) and return the people as JSON.

Rules:
- Return ONLY a JSON object that matches the schema below. No prose, no markdown.
- One entry per person, in the order of the list. Never invent a person; never drop one.
- "name": the full name in the conventional form, first name first, not in capitals. "name_en": the same name in Latin letters (a transliteration when the list gives none).
- "name_short": the initial of the first name and the surname, for example "Μ. Νεανίδη"; "name_short_en" the same in Latin letters.
- "roleName": the title of the person on the body as the list gives it, for example "Πρόεδρος", "Αντιπρόεδρος", "Γραμματέας"; null for a plain member. "roleName_en": the title in English, null when roleName is null.
- "isHead": true for the one person who chairs the body (Πρόεδρος, Président, Chair), otherwise false.
- Skip lines that are not people: headings, dates, signatures, counts.

JSON SCHEMA:
${JSON.stringify(RESULT_SCHEMA_JSON, null, 2)}`;

export class RosterParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RosterParseError';
    }
}

/**
 * The entries of a pasted list, checked against the schema the import
 * route applies. A malformed answer is an error the admin sees, not a
 * silent partial list.
 */
export async function parseRosterText(
    text: string,
    context: { bodyName: string; cityName: string; language: string },
): Promise<RosterEntry[]> {
    const userPrompt = JSON.stringify({ ...context, list: text }, null, 2);
    const { result } = await aiChat<unknown>(SYSTEM_PROMPT, userPrompt, undefined, undefined, { maxTokens: 8192 });
    const parsed = rosterParseResultSchema.safeParse(result);
    if (!parsed.success) {
        throw new RosterParseError('The list could not be read. Check that it names one person per line and try again.');
    }
    return parsed.data.entries;
}
