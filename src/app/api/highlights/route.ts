import { NextRequest, NextResponse } from "next/server";
import { upsertHighlight } from "@/lib/db/highlights";
import { handleApiError } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, meetingId, cityId, utteranceIds, subjectId } = body || {};

        if (!meetingId || !cityId || !Array.isArray(utteranceIds)) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }

        const highlight = await upsertHighlight({
            name, // Will be auto-generated if not provided
            meetingId,
            cityId,
            utteranceIds,
            subjectId
        });

        return NextResponse.json(highlight, { status: 201 });
    } catch (error) {
        return handleApiError(error, "Failed to create highlight");
    }
} 