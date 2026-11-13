import "server-only";
import { TaskStatus } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import type { GenerateVoiceprintRequest } from "@/lib/apiTypes";

function requestPersonId(body: string): string | null {
    try {
        return (JSON.parse(body) as GenerateVoiceprintRequest).personId;
    } catch {
        return null;
    }
}

/**
 * The generateVoiceprint tasks of one person, newest first. The person
 * filter is a text match on the request body, so the database returns only
 * candidate rows; the parsed `personId` decides, so that p1 does not get
 * the tasks of p10.
 */
export async function findVoiceprintTasks(personId: string): Promise<TaskStatus[]> {
    const tasks = await prisma.taskStatus.findMany({
        where: { type: "generateVoiceprint", requestBody: { contains: personId } },
        orderBy: { createdAt: "desc" },
    });
    return tasks.filter((task) => requestPersonId(task.requestBody) === personId);
}
