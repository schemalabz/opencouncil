import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { deleteTopic, updateTopic } from "@/lib/db/topics";
import { handleApiError } from "@/lib/api/errors";

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function PUT(
    request: Request,
    { params }: { params: { topicId: string } }
) {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const data = await request.json();
        const { name, name_en, colorHex, icon, description, deprecated } = data;

        if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
            return new NextResponse("name must be a non-empty string", { status: 400 });
        }
        if (name_en !== undefined && (typeof name_en !== "string" || name_en.trim() === "")) {
            return new NextResponse("name_en must be a non-empty string", { status: 400 });
        }
        if (colorHex !== undefined && (typeof colorHex !== "string" || !HEX_REGEX.test(colorHex))) {
            return new NextResponse("colorHex must be a valid hex color", { status: 400 });
        }
        if (description !== undefined && typeof description !== "string") {
            return new NextResponse("description must be a string", { status: 400 });
        }
        if (icon !== undefined && icon !== null && typeof icon !== "string") {
            return new NextResponse("icon must be a string or null", { status: 400 });
        }
        if (deprecated !== undefined && typeof deprecated !== "boolean") {
            return new NextResponse("deprecated must be a boolean", { status: 400 });
        }

        const topic = await updateTopic(params.topicId, {
            name: name === undefined ? undefined : name.trim(),
            name_en: name_en === undefined ? undefined : name_en.trim(),
            colorHex,
            icon: icon === undefined ? undefined : (icon || null),
            description,
            deprecated,
        });

        revalidatePath("/admin/topics");
        revalidatePath("/api/topics");

        return NextResponse.json(topic);
    } catch (error) {
        return handleApiError(error, "Failed to update topic");
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: { topicId: string } }
) {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        await deleteTopic(params.topicId);

        revalidatePath("/admin/topics");
        revalidatePath("/api/topics");

        return NextResponse.json({ message: "Topic deleted successfully" });
    } catch (error) {
        return handleApiError(error, "Failed to delete topic");
    }
}
