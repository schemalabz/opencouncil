import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getBodyForRoster } from '@/lib/db/bodyMembers';
import { handleApiError, BadRequestError } from '@/lib/api/errors';
import { parseRosterText, RosterParseError } from '@/lib/bodyRosterText';
import { rosterParseRequestSchema } from '@/lib/zod-schemas/bodyMembers';

type Params = { params: Promise<{ cityId: string; bodyId: string }> };

/** Read a pasted list of members into entries the admin confirms (#829). Writes nothing. */
export async function POST(request: NextRequest, props: Params) {
    const { cityId, bodyId } = await props.params;
    try {
        const { text } = rosterParseRequestSchema.parse(await request.json());
        // Gated on the body: an admin of the body or of its city.
        const body = await getBodyForRoster(cityId, bodyId);
        const entries = await parseRosterText(text, { bodyName: body.name, cityName: body.city.name, language: body.city.language });
        return NextResponse.json({ entries });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        if (error instanceof RosterParseError) {
            return handleApiError(new BadRequestError(error.message), error.message);
        }
        return handleApiError(error, 'Failed to read the list');
    }
}
