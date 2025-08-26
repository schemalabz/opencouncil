import { NextRequest, NextResponse } from "next/server";
import { getGenerateHighlightTasksForHighlight } from "@/lib/db/tasks";
import { requestGenerateHighlight } from "@/lib/tasks/generateHighlight";

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
        return NextResponse.json(tasks, { status: 200 });
    } catch (error: any) {
        console.error("Failed to fetch tasks:", error);
        return NextResponse.json({ error: error?.message || "Failed to fetch tasks" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { highlightId, options } = body || {};
        if (!highlightId) {
            return NextResponse.json({ error: "Missing highlightId" }, { status: 400 });
        }
        const task = await requestGenerateHighlight(highlightId, options);
        return NextResponse.json(task, { status: 201 });
    } catch (error: any) {
        console.error("Failed to start generation:", error);
        return NextResponse.json({ error: error?.message || "Failed to start generation" }, { status: 500 });
    }
} 