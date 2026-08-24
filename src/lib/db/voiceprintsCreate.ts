// Server-only (NOT a "use server" action). createVoicePrintDirect has no user
// gate because its sole caller, handleGenerateVoiceprintResult, runs on the
// task-server callback path where there is no session. Living off the Server
// Action surface keeps it unreachable from client calls; the session-gated
// deleteVoicePrint stays in voiceprints.ts.
import "server-only";
import type { VoicePrint } from "@prisma/client";
import { revalidatePath } from "next/cache";
import prisma from "./prisma";

export async function createVoicePrintDirect(
    voiceprint: Omit<VoicePrint, "id" | "createdAt" | "updatedAt">,
): Promise<string | null> {
    const person = await prisma.person.findUnique({
        where: { id: voiceprint.personId },
    });

    if (!person) {
        throw new Error("Person not found");
    }

    try {
        const voicePrint = await prisma.voicePrint.create({
            data: {
                embedding: voiceprint.embedding,
                personId: voiceprint.personId,
                sourceSegmentId: voiceprint.sourceSegmentId,
                sourceAudioUrl: voiceprint.sourceAudioUrl,
                startTimestamp: voiceprint.startTimestamp,
                endTimestamp: voiceprint.endTimestamp,
            },
        });

        revalidatePath(`/admin/people`, "page");

        console.log(`Created voice print with ID: ${voicePrint.id}`);
        return voicePrint.id;
    } catch (error) {
        console.error("Error creating voice print:", error);
        throw new Error("Failed to create voice print");
    }
}
