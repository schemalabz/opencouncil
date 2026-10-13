import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { deleteConsultationCommentResponse, respondToConsultationComment } from "@/lib/db/consultationResponses";

type Params = { params: Promise<{ commentId: string }> };

/** Publishes the municipality's response to a comment, or replaces it. Body: `{ text }`, plain text. */
export async function PUT(request: NextRequest, props: Params) {
    const { commentId } = await props.params;
    try {
        const body: unknown = await request.json().catch(() => ({}));
        const text = typeof body === 'object' && body !== null && 'text' in body && typeof body.text === 'string' ? body.text : '';
        return NextResponse.json(await respondToConsultationComment(commentId, text));
    } catch (error) {
        return handleApiError(error, 'Failed to save the response');
    }
}

/** Removes the municipality's response to a comment. */
export async function DELETE(_request: NextRequest, props: Params) {
    const { commentId } = await props.params;
    try {
        await deleteConsultationCommentResponse(commentId);
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, 'Failed to delete the response');
    }
}
