import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminRealms } from "@/lib/auth";
import { createTopic, getAllTopicsWithSubjectCount } from "@/lib/db/topics";
import { handleApiError } from "@/lib/api/errors";
import { createTopicSchema } from "@/lib/zod-schemas/topic";

export async function GET() {
    try {
        await getAdminRealms();
        const topics = await getAllTopicsWithSubjectCount();
        return NextResponse.json(topics);
    } catch (error) {
        return handleApiError(error, "Failed to fetch topics");
    }
}

export async function POST(request: Request) {
    try {
        await getAdminRealms();
        const data = createTopicSchema.parse(await request.json());

        // createTopic refuses a realm the viewer does not administer.
        const topic = await createTopic(data);

        revalidatePath("/admin/topics");
        revalidatePath("/api/topics");

        return NextResponse.json(topic);
    } catch (error) {
        return handleApiError(error, "Failed to create topic");
    }
}
