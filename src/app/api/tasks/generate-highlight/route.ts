import { NextRequest, NextResponse } from "next/server";
import * as z from "zod";
import { getGenerateHighlightTasksForHighlight } from "@/lib/db/tasks";
import { requestGenerateHighlight } from "@/lib/tasks/generateHighlight";
import { generateHighlightOptionsSchema } from "@/lib/tasks/generateHighlightOptions";
import { handleApiError } from "@/lib/api/errors";

const generateRequestSchema = z.object({
    highlightId: z.string().min(1),
    options: generateHighlightOptionsSchema.optional(),
});

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const cityId = searchParams.get("cityId");
        const meetingId = searchParams.get("meetingId");
        const highlightId = searchParams.get("highlightId");
        if (!cityId || !meetingId || !highlightId) {
            return NextResponse.json({ error: "Missing params" }, { status: 400 });
        }
        const tasks = await getGenerateHighlightTasksForHighlight(cityId, meetingId, highlightId);
        // A highlight owner may poll the progress. The request body holds the
        // callback URL with its token, and the response body is the renderer's
        // report; neither is theirs to read.
        const progress = tasks.map(({ requestBody, responseBody, ...task }) => task);
        return NextResponse.json(progress, { status: 200 });
    } catch (error: any) {
        console.error("Failed to fetch tasks:", error);
        return NextResponse.json({ error: error?.message || "Failed to fetch tasks" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { highlightId, options } = generateRequestSchema.parse(await req.json());
        const task = await requestGenerateHighlight(highlightId, options);
        return NextResponse.json(task, { status: 201 });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return handleApiError(error);
        }
        console.error("Failed to start generation:", error);
        const message = error instanceof Error ? error.message : "Failed to start generation";
        return NextResponse.json({ error: message }, { status: 500 });
    }
} 