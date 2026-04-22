import { getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createServiceApiKey, getServiceApiKeys } from "@/lib/db/apiKeys";
import { handleApiError } from "@/lib/api/errors";
import { z } from "zod";

const createKeySchema = z.object({
    name: z.string().min(1).max(100).trim(),
});

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!user.isSuperAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const keys = await getServiceApiKeys();
        return NextResponse.json(keys);
    } catch (error) {
        return handleApiError(error, "Failed to fetch API keys");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!user.isSuperAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { name } = createKeySchema.parse(body);

        const result = await createServiceApiKey(name, user.id);

        // Return the raw key in the response — this is the only time it's visible
        return NextResponse.json({
            id: result.id,
            name: result.name,
            keyPrefix: result.keyPrefix,
            rawKey: result.rawKey,
            createdAt: result.createdAt,
        }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.errors }, { status: 400 });
        }
        return handleApiError(error, "Failed to create API key");
    }
}
