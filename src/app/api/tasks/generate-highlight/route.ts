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
        // A highlight owner may poll the progress, and only the progress: the
        // request body holds the callback URL with its token, the response
        // body is the renderer's report, and the failure reason is internal.
        const progress = tasks.map(({ id, status, stage, percentComplete, createdAt, updatedAt }) =>
            ({ id, status, stage, percentComplete, createdAt, updatedAt }));
        return NextResponse.json(progress, { status: 200 });
    } catch (error: unknown) {
        console.error("Failed to fetch tasks:", error);
        const message = error instanceof Error ? error.message : "Failed to fetch tasks";
        return NextResponse.json({ error: message }, { status: 500 });
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