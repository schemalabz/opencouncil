"use server";
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { revalidatePath } from "next/cache";

// Creating a voiceprint lives in voiceprintsCreate.ts (server-only): its sole
// caller is the task-server callback path, which has no session, so the
// function cannot carry a user gate and must stay off the Server Action
// surface instead.

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

        await prisma.voicePrint.delete({
            where: { id: voicePrintId },
        });
        revalidatePath(`/admin/people`, "page");
    } catch (error) {
        console.error("Error deleting voice print:", error);
        throw new Error("Failed to delete voice print");
    }
}
