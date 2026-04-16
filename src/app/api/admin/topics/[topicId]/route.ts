import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { deleteTopic, updateTopic } from "@/lib/db/topics";
import { handleApiError } from "@/lib/api/errors";
import { updateTopicSchema } from "@/lib/zod-schemas/topic";

export async function PUT(
    request: Request,
    { params }: { params: { topicId: string } }
) {
    await withUserAuthorizedToEdit({});

    try {
        const data = updateTopicSchema.parse(await request.json());

        const topic = await updateTopic(params.topicId, data);

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
