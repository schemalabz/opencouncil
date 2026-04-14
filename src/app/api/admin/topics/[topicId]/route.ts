import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { deleteTopic, updateTopic } from "@/lib/db/topics";
import { BadRequestError, handleApiError } from "@/lib/api/errors";
import { HEX_REGEX } from "@/lib/utils/colorSuggestion";

export async function PUT(
    request: Request,
    { params }: { params: { topicId: string } }
) {
    await withUserAuthorizedToEdit({});

    try {
        const data = await request.json();
        const { name, name_en, colorHex, icon, description, deprecated } = data;

        if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
            throw new BadRequestError("name must be a non-empty string");
        }
        if (name_en !== undefined && (typeof name_en !== "string" || name_en.trim() === "")) {
            throw new BadRequestError("name_en must be a non-empty string");
        }
        if (colorHex !== undefined && (typeof colorHex !== "string" || !HEX_REGEX.test(colorHex))) {
            throw new BadRequestError("colorHex must be a valid hex color");
        }
        if (description !== undefined && typeof description !== "string") {
            throw new BadRequestError("description must be a string");
        }
        if (icon !== undefined && icon !== null && typeof icon !== "string") {
            throw new BadRequestError("icon must be a string or null");
        }
        if (deprecated !== undefined && typeof deprecated !== "boolean") {
            throw new BadRequestError("deprecated must be a boolean");
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
    await withUserAuthorizedToEdit({});

    try {
        await deleteTopic(params.topicId);

        revalidatePath("/admin/topics");
        revalidatePath("/api/topics");

        return NextResponse.json({ message: "Topic deleted successfully" });
    } catch (error) {
        return handleApiError(error, "Failed to delete topic");
    }
}
