/**
 * The generateVoiceprint result handler, and the consent check it shares with
 * the request. NOT in a "use server" file: the handler writes a voiceprint
 * with no session to gate on, so it must not be callable as a Server Action.
 * Only the task-server callback and the admin's reprocess reach it, through
 * the registry.
 */
import "server-only";
import prisma from "@/lib/db/prisma";
import { GenerateVoiceprintResult } from "@/lib/apiTypes";
import { createVoicePrintDirect } from "@/lib/db/voiceprintsCreate";
import { getConsentedPersonIds } from "@/lib/db/personConsent";

/** Whether the person's voiceprint consent is in force now (see voicePrintConsentInForce). */
export async function hasVoicePrintConsent(personId: string): Promise<boolean> {
    return (await getConsentedPersonIds([personId])).has(personId);
}

/**
 * Store the embedding of a generateVoiceprint task as the person's voiceprint.
 * The consent was in force when the task started; a withdrawal since then
 * fails the task, so the admin sees why. Nothing is deleted: the clip the task
 * uploaded stays, as a stored voiceprint stays after a withdrawal.
 */
export async function handleGenerateVoiceprintResult(taskId: string, result: GenerateVoiceprintResult): Promise<void> {
    const taskStatus = await prisma.taskStatus.findUnique({
        where: { id: taskId },
    });

    if (!taskStatus) {
        throw new Error("Task status not found");
    }

    const requestBody = JSON.parse(taskStatus.requestBody);

    if (!await hasVoicePrintConsent(requestBody.personId)) {
        throw new Error(`Voiceprint not stored: person ${requestBody.personId} has no voiceprint consent in force`);
    }

    try {
        await createVoicePrintDirect({
            personId: requestBody.personId,
            sourceSegmentId: requestBody.segmentId,
            startTimestamp: requestBody.startTimestamp,
            endTimestamp: requestBody.endTimestamp,
            sourceAudioUrl: result.audioUrl,
            embedding: result.voiceprint,
        });
    } catch (error) {
        console.error("Error creating voiceprint:", error);
    }
}
