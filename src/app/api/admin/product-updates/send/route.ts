import { NextResponse } from "next/server";
import * as z from "zod";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api/errors";
import { sendProductUpdateToAll, sendProductUpdateTest } from "@/lib/email/productUpdate";

// Resend tag-value rules: ASCII letters/digits/underscores/dashes, ≤ 256 chars.
const tagValue = z.string().regex(/^[A-Za-z0-9_-]+$/).max(256);

const sendSchema = z.object({
    subject: z.string().trim().min(1).max(200),
    bodyHtml: z.string().trim().min(1),
    testEmail: z.email().optional(),
    testName: z.string().max(120).optional(),
    tags: z.array(tagValue).max(70).optional(),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!user.isSuperAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let payload;
    try {
        payload = sendSchema.parse(await request.json());
    } catch (error) {
        return handleApiError(error, "Invalid request body");
    }

    try {
        const result = payload.testEmail
            ? await sendProductUpdateTest({
                subject: payload.subject,
                bodyHtml: payload.bodyHtml,
                testEmail: payload.testEmail,
                testName: payload.testName,
                adminUserId: user.id,
                customTags: payload.tags,
            })
            : await sendProductUpdateToAll({
                subject: payload.subject,
                bodyHtml: payload.bodyHtml,
                customTags: payload.tags,
            });
        return NextResponse.json(result);
    } catch (error) {
        return handleApiError(error, "Failed to send product update emails");
    }
}
