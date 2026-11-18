import { NextRequest, NextResponse } from 'next/server';
import { defaultImportStart, requireBody } from '@/lib/db/bodyMembers';
import { handleApiError, BadRequestError } from '@/lib/api/errors';
import { parseRosterText, RosterParseError } from '@/lib/bodyRosterText';
import { rosterParseRequestSchema } from '@/lib/zod-schemas/bodyMembers';

type Params = { params: Promise<{ cityId: string; bodyId: string }> };

/**
 * Read a pasted list of members into entries the admin confirms (#829), with
 * the start date that the import gives them when the admin sets none. Writes
 * nothing.
 */
export async function POST(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        const body = await requireBody(cityId, bodyId);
        const { text } = rosterParseRequestSchema.parse(await request.json());
        const [entries, startDate] = await Promise.all([
            parseRosterText(text, { bodyName: body.name, cityName: body.city.name, language: body.city.language }),
            defaultImportStart(body),
        ]);
        return NextResponse.json({ entries, startDate });
    } catch (error) {
        if (error instanceof RosterParseError) {
            return handleApiError(new BadRequestError(error.message), error.message);
        }
        return handleApiError(error, 'Failed to read the list');
    }
}
