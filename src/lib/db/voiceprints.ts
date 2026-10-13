"use server";
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { revalidatePath } from "next/cache";
import { deleteVoicePrints } from "./voiceprintsDelete";

// Creating a voiceprint lives in voiceprintsCreate.ts (server-only): its sole
// caller is the task-server callback path, which has no session, so the
// function cannot carry a user gate and must stay off the Server Action
// surface instead. Deleting lives in voiceprintsDelete.ts for the same
// reason: a withdrawal and the cleanup script delete with no session.

export async function deleteVoicePrint(voicePrintId: string): Promise<void> {
    try {
        // Get voiceprint to verify authorization
        const voicePrint = await prisma.voicePrint.findUnique({
            where: { id: voicePrintId },
            include: {
                person: {
                    select: { cityId: true },
                },
            },
        });

        if (!voicePrint) {
            throw new Error("Voice print not found");
        }

        await withUserAuthorizedToEdit({ cityId: voicePrint.person.cityId });

        // The row and its clip; a clip that stays is logged by deleteVoicePrints.
        await deleteVoicePrints({ id: voicePrintId });
        revalidatePath(`/admin/people`, "page");
    } catch (error) {
        console.error("Error deleting voice print:", error);
        throw new Error("Failed to delete voice print");
    }
}
