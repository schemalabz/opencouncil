import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { createTopic, getAllTopicsWithSubjectCount } from "@/lib/db/topics";
import { BadRequestError, handleApiError } from "@/lib/api/errors";
import { HEX_REGEX } from "@/lib/utils/colorSuggestion";

export async function GET() {
    await withUserAuthorizedToEdit({});

    try {
        const topics = await getAllTopicsWithSubjectCount();
        return NextResponse.json(topics);
    } catch (error) {
        return handleApiError(error, "Failed to fetch topics");
    }
}

export async function POST(request: Request) {
    await withUserAuthorizedToEdit({});

    try {
        const data = await request.json();
        const { name, name_en, colorHex, icon, description, deprecated } = data;

        if (typeof name !== "string" || name.trim() === "") {
            throw new BadRequestError("name is required");
        }
        if (typeof name_en !== "string" || name_en.trim() === "") {
            throw new BadRequestError("name_en is required");
        }
        if (typeof colorHex !== "string" || !HEX_REGEX.test(colorHex)) {
            throw new BadRequestError("colorHex must be a valid hex color");
        }
        if (typeof description !== "string") {
            throw new BadRequestError("description must be a string");
        }
        if (icon !== undefined && icon !== null && typeof icon !== "string") {
            throw new BadRequestError("icon must be a string or null");
        }
        if (deprecated !== undefined && typeof deprecated !== "boolean") {
            throw new BadRequestError("deprecated must be a boolean");
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
