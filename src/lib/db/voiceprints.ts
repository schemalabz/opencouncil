"use server";
import prisma from "./prisma";
import { withUserAuthorizedToEdit } from "../auth";
import { revalidatePath } from "next/cache";
import { deleteVoicePrintById } from "./voiceprintsDelete";

// Creating and deleting a voiceprint without a session live in the
// server-only voiceprintsCreate.ts and voiceprintsDelete.ts.

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

        await deleteVoicePrintById(voicePrintId);
        revalidatePath(`/admin/people`, "page");
    } catch (error) {
        console.error("Error deleting voice print:", error);
        throw new Error("Failed to delete voice print");
    }
}
