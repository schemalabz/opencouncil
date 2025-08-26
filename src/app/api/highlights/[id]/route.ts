import { NextRequest, NextResponse } from "next/server";
import { deleteHighlight, toggleHighlightShowcase, upsertHighlight, getHighlight } from "@/lib/db/highlights";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    try {
        if (!params.id) {
            return NextResponse.json({ error: "Missing highlight ID" }, { status: 400 });
        }
        const highlight = await getHighlight(params.id);
        if (!highlight) {
            return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
        }
        return NextResponse.json(highlight, { status: 200 });
    } catch (error: any) {
        console.error("Failed to fetch highlight:", error);
        return NextResponse.json({ error: error?.message || "Failed to fetch highlight" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const body = await req.json();
        const { name, meetingId, cityId, utteranceIds, subjectId } = body || {};
        if (!params.id || !name || !meetingId || !cityId || !Array.isArray(utteranceIds)) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }
        const highlight = await upsertHighlight({
            id: params.id,
            name,
            meetingId,
            cityId,
            utteranceIds,
            subjectId
        });
        return NextResponse.json(highlight, { status: 200 });
    } catch (error: any) {
        console.error("Failed to update highlight:", error);
        return NextResponse.json({ error: error?.message || "Failed to update" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
    try {
        if (!params.id) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }
        await deleteHighlight(params.id);
        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error: any) {
        console.error("Failed to delete highlight:", error);
        return NextResponse.json({ error: error?.message || "Failed to delete" }, { status: 500 });
    }
}

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
    try {
        if (!params.id) {
            return NextResponse.json({ error: "Missing highlight ID" }, { status: 400 });
        }
        const updated = await toggleHighlightShowcase(params.id);
        return NextResponse.json(updated, { status: 200 });
    } catch (error: any) {
        console.error("Failed to toggle showcase:", error);
        return NextResponse.json({ error: error?.message || "Failed to toggle showcase" }, { status: 500 });
    }
} 