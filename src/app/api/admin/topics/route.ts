import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createTopic, getAllTopicsWithSubjectCount } from "@/lib/db/topics";
import { handleApiError } from "@/lib/api/errors";

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

        if (typeof name !== "string" || name.trim() === "") {
            return new NextResponse("name is required", { status: 400 });
        }
        if (typeof name_en !== "string" || name_en.trim() === "") {
            return new NextResponse("name_en is required", { status: 400 });
        }
        if (typeof colorHex !== "string" || !HEX_REGEX.test(colorHex)) {
            return new NextResponse("colorHex must be a valid hex color", { status: 400 });
        }
        if (typeof description !== "string") {
            return new NextResponse("description must be a string", { status: 400 });
        }
        if (icon !== undefined && icon !== null && typeof icon !== "string") {
            return new NextResponse("icon must be a string or null", { status: 400 });
        }
        if (deprecated !== undefined && typeof deprecated !== "boolean") {
            return new NextResponse("deprecated must be a boolean", { status: 400 });
        }

        const topic = await createTopic({
            name: name.trim(),
            name_en: name_en.trim(),
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
