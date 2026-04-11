import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { deleteTopic, updateTopic } from "@/lib/db/topics";
import { handleApiError } from "@/lib/api/errors";

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

        const topic = await updateTopic(params.topicId, {
            name,
            name_en,
            colorHex,
            icon: icon === undefined ? undefined : (icon || null),
            description,
            deprecated: deprecated === undefined ? undefined : Boolean(deprecated),
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
