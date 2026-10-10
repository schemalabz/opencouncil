import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api/errors";
import { sendProductUpdateToAll, sendProductUpdateTest } from "@/lib/email/productUpdate";
import { productUpdateSendSchema } from "@/lib/zod-schemas/productUpdate";

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
        payload = productUpdateSendSchema.parse(await request.json());
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
