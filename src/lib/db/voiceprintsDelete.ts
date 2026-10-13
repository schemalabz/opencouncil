/**
 * Deletion of voiceprints, with the audio clips behind them.
 *
 * NOT a "use server" file: the withdrawal of a consent and the cleanup script
 * call this with no session to gate on, so it must not be a Server Action.
 * The admin's button goes through deleteVoicePrint in voiceprints.ts, which
 * authorizes first.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { env } from "@/env.mjs";
import { deleteFile } from "@/lib/s3";
import { spacesObjectFromUrl } from "@/lib/utils/spacesUrl";
import { voicePrintsWithoutConsentWhere } from "@/lib/db/voicePrintConsentRule";

const voicePrintToDeleteSelect = {
    id: true,
    personId: true,
    sourceAudioUrl: true,
    person: { select: { name: true, cityId: true } },
} satisfies Prisma.VoicePrintSelect;

export type VoicePrintToDelete = Prisma.VoicePrintGetPayload<{ select: typeof voicePrintToDeleteSelect }>;

export type VoicePrintDeletion = {
    /** The rows that were (or, in a dry run, would be) deleted. */
    voicePrints: VoicePrintToDelete[];
    /** Clips that could not be removed; the row is gone, the object is not. */
    clipFailures: { voicePrintId: string; sourceAudioUrl: string; error: string }[];
};

/**
 * Remove a clip from Spaces. The task server wrote it to its own bucket,
 * which the URL names. A URL that is not a Spaces object is left alone: the
 * seed data and the mock task server point at files that are nobody's to
 * delete.
 */
export async function deleteClip(sourceAudioUrl: string): Promise<void> {
    const object = spacesObjectFromUrl(sourceAudioUrl, { bucket: env.DO_SPACES_BUCKET, cdnUrl: env.CDN_URL });
    if (!object) {
        console.warn(`Voiceprint clip ${sourceAudioUrl} is not a Spaces object; nothing to delete`);
        return;
    }
    await deleteFile(object.bucket, object.key);
}

/**
 * Delete the voiceprints `where` selects, each with its clip. The row goes
 * first: a voiceprint that is no longer in the table is one the transcribe
 * request cannot send, whatever happens to the clip after. A clip that
 * cannot be removed is reported, not thrown: a withdrawal must not fail on
 * an object store, and the cleanup script lists what is left to do.
 */
export async function deleteVoicePrints(where: Prisma.VoicePrintWhereInput, { dryRun = false }: { dryRun?: boolean } = {}): Promise<VoicePrintDeletion> {
    const voicePrints = await prisma.voicePrint.findMany({ where, select: voicePrintToDeleteSelect, orderBy: [{ person: { cityId: "asc" } }, { createdAt: "asc" }] });
    const clipFailures: VoicePrintDeletion["clipFailures"] = [];
    if (dryRun) return { voicePrints, clipFailures };

    for (const voicePrint of voicePrints) {
        await prisma.voicePrint.delete({ where: { id: voicePrint.id } });
        try {
            await deleteClip(voicePrint.sourceAudioUrl);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`Voiceprint ${voicePrint.id} deleted, but its clip ${voicePrint.sourceAudioUrl} was not:`, error);
            clipFailures.push({ voicePrintId: voicePrint.id, sourceAudioUrl: voicePrint.sourceAudioUrl, error: message });
        }
    }
    return { voicePrints, clipFailures };
}

/**
 * Delete the voiceprints of every person with no consent in force, or of one
 * such person. Idempotent, and safe to call for a person whose consent is in
 * force: their voiceprints do not match and stay.
 */
export async function deleteVoicePrintsWithoutConsent({ personId, cityId, dryRun = false }: { personId?: string; cityId?: string; dryRun?: boolean } = {}): Promise<VoicePrintDeletion> {
    return deleteVoicePrints({
        ...voicePrintsWithoutConsentWhere,
        ...(personId ? { personId } : {}),
        ...(cityId ? { person: { ...voicePrintsWithoutConsentWhere.person, cityId } } : {}),
    }, { dryRun });
}
