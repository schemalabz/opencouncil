import "server-only";
import { TaskStatus } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import type { GenerateVoiceprintRequest, GenerateVoiceprintResult } from "@/lib/apiTypes";

export type VoiceprintTask = {
    task: TaskStatus;
    request: GenerateVoiceprintRequest;
    result: GenerateVoiceprintResult | null;
};

function parse<T>(body: string | null): T | null {
    if (body === null) return null;
    try {
        return JSON.parse(body) as T;
    } catch {
        return null;
    }
}

/**
 * The generateVoiceprint tasks of one person, or of every person of a city,
 * newest first, with their request and result read from the stored JSON. The
 * person filter is a text match on the request body, so the database returns
 * only candidate rows; the parsed `personId` decides.
 */
export async function findVoiceprintTasks(scope: { personId: string } | { cityId: string }): Promise<VoiceprintTask[]> {
    const tasks = await prisma.taskStatus.findMany({
        where: {
            type: "generateVoiceprint",
            ...("cityId" in scope ? { cityId: scope.cityId } : { requestBody: { contains: scope.personId } }),
        },
        orderBy: { createdAt: "desc" },
    });
    return tasks.flatMap((task) => {
        const request = parse<GenerateVoiceprintRequest>(task.requestBody);
        if (!request) return [];
        if ("personId" in scope && request.personId !== scope.personId) return [];
        return [{ task, request, result: parse<GenerateVoiceprintResult>(task.responseBody) }];
    });
}
