/**
 * The generateVoiceprint result handler. Not in a "use server" file: it
 * writes a voiceprint with no session to gate on. Only the task-server
 * callback and the admin's reprocess reach it, through the registry.
 */
import "server-only";
import prisma from "@/lib/db/prisma";
import { GenerateVoiceprintRequest, GenerateVoiceprintResult } from "@/lib/apiTypes";
import { createVoicePrintDirect } from "@/lib/db/voiceprintsCreate";
import { hasVoicePrintConsent } from "@/lib/db/voicePrintConsentRule";
import { deleteVoiceDataWithoutConsent } from "@/lib/db/voiceprintsDelete";

/**
 * Store the embedding of a generateVoiceprint task as the person's voiceprint.
 * The consent was in force when the task started; a withdrawal since then
 * fails the task, so the admin sees why, and the clip the task uploaded goes,
 * as the person's stored voiceprints went with the withdrawal.
 */
export async function handleGenerateVoiceprintResult(taskId: string, result: GenerateVoiceprintResult): Promise<void> {
    const taskStatus = await prisma.taskStatus.findUnique({
        where: { id: taskId },
    });

    if (!taskStatus) {
        throw new Error("Task status not found");
    }

    const requestBody = JSON.parse(taskStatus.requestBody) as GenerateVoiceprintRequest;

    if (!await hasVoicePrintConsent(requestBody.personId)) {
        // The clip that the task uploaded is in the person's folder; the refusal stands whatever happens to it.
        await deleteVoiceDataWithoutConsent({ personId: requestBody.personId }, `voiceprint of task ${taskId} refused`);
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
