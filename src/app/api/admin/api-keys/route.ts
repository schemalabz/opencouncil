import { getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createServiceApiKey, getServiceApiKeys } from "@/lib/db/apiKeys";
import { handleApiError } from "@/lib/api/errors";

export async function GET() {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    if (!user?.isSuperAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { name } = await request.json();
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        const result = await createServiceApiKey(name.trim(), user.id);

        // Return the raw key in the response — this is the only time it's visible
        return NextResponse.json({
            id: result.id,
            name: result.name,
            keyPrefix: result.keyPrefix,
            rawKey: result.rawKey,
            createdAt: result.createdAt,
        }, { status: 201 });
    } catch (error) {
        return handleApiError(error, "Failed to create API key");
    }
}
