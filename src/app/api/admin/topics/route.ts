import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createTopic, getAllTopicsWithSubjectCount } from "@/lib/db/topics";
import { handleApiError } from "@/lib/api/errors";

export async function GET() {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const topics = await getAllTopicsWithSubjectCount();
        return NextResponse.json(topics);
    } catch (error) {
        return handleApiError(error, "Failed to fetch topics");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const data = await request.json();
        const { name, name_en, colorHex, icon, description, deprecated } = data;

        if (!name || !name_en || !colorHex || typeof description !== "string") {
            return new NextResponse("Missing required fields", { status: 400 });
        }

        const topic = await createTopic({
            name,
            name_en,
            colorHex,
            icon: icon || null,
            description,
            deprecated: Boolean(deprecated),
        });

        revalidatePath("/admin/topics");
        revalidatePath("/api/topics");

        return NextResponse.json(topic);
    } catch (error) {
        return handleApiError(error, "Failed to create topic");
    }
}
