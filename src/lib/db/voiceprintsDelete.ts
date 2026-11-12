/**
 * Deletion of a person's voice data: the voiceprint rows and the audio clips
 * that the task server cut for them.
 *
 * One model serves every caller: list the clip folders in the bucket, keep
 * the clips of people with a consent in force, and delete the rest with the
 * rows of the people without one. A person who no longer exists has no
 * consent, so a person delete and a city delete use the same model. The
 * withdrawals, the claim and the deletes call deleteVoiceDataWithoutConsent;
 * the cleanup script calls planVoiceDataDeletion and runVoiceDataDeletion.
 *
 * Not a "use server" file: its callers have no session to gate on. The
 * admin's Delete button goes through deleteVoicePrint in voiceprints.ts,
 * which authorizes first.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { env } from "@/env.mjs";
import { deleteFile, isStorageConfigured, listObjectKeys } from "@/lib/s3";
import { spacesObjectFromUrl, type SpacesObject } from "@/lib/utils/spacesUrl";
import { getConsentedPersonIds, voicePrintsWithoutConsentWhere } from "@/lib/db/voicePrintConsentRule";
import { errorMessage } from "@/lib/utils/errors";
import { sendErrorAdminAlert } from "@/lib/discord-core";

/**
 * Where the task server puts every clip: `voiceprints/{cityId}/{personId}/{random}_v1.mp3`
 * (opencouncil-tasks, generateVoiceprint.ts). The cityId is the city of the
 * meeting that the clip was cut from.
 */
const CLIP_ROOT = "voiceprints/";
const KEY_PART = /^[A-Za-z0-9_-]+$/;

/** Whether `part` can be a city or a person part of a clip key. */
export const isClipKeyPart = (part: string) => KEY_PART.test(part);

type ClipKey = { cityId: string; personId: string };

/** The city and the person of a clip key, or null for a key of another shape. */
function parseClipKey(key: string): ClipKey | null {
    const [root, cityId, personId, file] = key.split("/");
    if (`${root}/` !== CLIP_ROOT || !file || !isClipKeyPart(cityId ?? "") || !isClipKeyPart(personId ?? "")) return null;
    return { cityId, personId };
}

const clipOwner = (key: string) => parseClipKey(key)?.personId ?? null;

/**
 * Clips are deleted only on production. Elsewhere the bucket setting can
 * name the production bucket (the previews, a developer's .env), and the
 * people carry production ids (the seed artifact), so a test withdrawal
 * would delete a production clip. The rows are deleted everywhere.
 */
const deletesClips = () => env.DEPLOYMENT_ENV === "production";

export type ClipFailure = { item: string; error: string };

const unique = <T,>(values: T[]) => [...new Set(values)];

const objectOf = (url: string) => spacesObjectFromUrl(url, { bucket: env.DO_SPACES_BUCKET, cdnUrl: env.CDN_URL });

async function deleteObject({ bucket, key }: SpacesObject): Promise<ClipFailure | null> {
    try {
        await deleteFile(bucket, key);
        return null;
    } catch (error) {
        return { item: `${bucket}/${key}`, error: errorMessage(error) };
    }
}

/** The clips whose owner has no consent in force; a person who no longer exists has none. */
async function clipsWithoutConsent<T extends SpacesObject>(clips: T[]): Promise<T[]> {
    const consented = await getConsentedPersonIds(unique(clips.flatMap(({ key }) => clipOwner(key) ?? [])));
    return clips.filter(({ key }) => {
        const owner = clipOwner(key);
        return owner !== null && !consented.has(owner);
    });
}

const planRowSelect = {
    id: true,
    sourceAudioUrl: true,
    person: { select: { name: true, cityId: true } },
} satisfies Prisma.VoicePrintSelect;

export type VoiceDataPlan = {
    /** The rows of people without a consent in force. */
    voicePrints: Prisma.VoicePrintGetPayload<{ select: typeof planRowSelect }>[];
    /** The clips in the folders of people without a consent in force. */
    clips: SpacesObject[];
    /** False when the clips were not listed: no storage keys, or `listClips: false`. */
    listed: boolean;
    /** Buckets that could not be listed: their clips are not in `clips`. */
    listFailures: ClipFailure[];
};

type Scope = { personId?: string; cityId?: string };

/**
 * The listed clips that `scope` covers. A person's clips sit in the folder
 * of the meeting's city, which can be another city than the person's. So a
 * city covers the clips in its folder and the clips of every person who no
 * longer exists: after a city delete, its people's clips in the folders of
 * other cities.
 */
async function clipsInScope(clips: (SpacesObject & ClipKey)[], scope: Scope): Promise<(SpacesObject & ClipKey)[]> {
    if (scope.personId !== undefined) return clips.filter((clip) => clip.personId === scope.personId);
    if (scope.cityId === undefined) return clips;
    const existing = await prisma.person.findMany({
        where: { id: { in: unique(clips.map((clip) => clip.personId)) } },
        select: { id: true },
    });
    const exists = new Set(existing.map((person) => person.id));
    return clips.filter((clip) => clip.cityId === scope.cityId || !exists.has(clip.personId));
}

/**
 * What a deletion removes, for one person, one city, or every person: the
 * rows of the people without a consent in force, and every clip in their
 * folders. The folders are found by listing `voiceprints/`, so a clip that
 * no row names is found too. Reads only. With `listClips: false`, or
 * without storage keys, it plans the rows only.
 */
export async function planVoiceDataDeletion(scope: Scope = {}, { listClips = true } = {}): Promise<VoiceDataPlan> {
    const voicePrints = await prisma.voicePrint.findMany({
        where: {
            AND: [
                voicePrintsWithoutConsentWhere,
                ...(scope.personId === undefined ? [] : [{ personId: scope.personId }]),
                ...(scope.cityId === undefined ? [] : [{ person: { cityId: scope.cityId } }]),
            ],
        },
        select: planRowSelect,
        orderBy: [{ person: { cityId: "asc" } }, { createdAt: "asc" }],
    });
    if (!listClips || !isStorageConfigured()) return { voicePrints, clips: [], listed: false, listFailures: [] };

    const urls = await prisma.voicePrint.findMany({ select: { sourceAudioUrl: true } });
    const buckets = unique([env.DO_SPACES_BUCKET, ...urls.flatMap((row) => objectOf(row.sourceAudioUrl)?.bucket ?? [])]);

    const listedClips: (SpacesObject & ClipKey)[] = [];
    const listFailures: ClipFailure[] = [];
    for (const bucket of buckets) {
        try {
            for (const key of await listObjectKeys(bucket, CLIP_ROOT)) {
                const clip = parseClipKey(key);
                if (clip) listedClips.push({ bucket, key, ...clip });
            }
        } catch (error) {
            listFailures.push({ item: `${bucket}/${CLIP_ROOT}`, error: errorMessage(error) });
        }
    }
    const clips = await clipsWithoutConsent(await clipsInScope(listedClips, scope));
    return { voicePrints, clips: clips.map(({ bucket, key }) => ({ bucket, key })), listed: true, listFailures };
}

/**
 * Delete what planVoiceDataDeletion found: the rows first, so the transcribe
 * request cannot send them whatever happens to the clips after, then the
 * clips. Both are checked against the consent again, so a consent given
 * since the plan keeps its voiceprint and its clips. A failed row delete
 * throws and keeps every clip.
 */
export async function runVoiceDataDeletion(plan: VoiceDataPlan): Promise<ClipFailure[]> {
    if (plan.voicePrints.length > 0) {
        await prisma.voicePrint.deleteMany({
            where: { AND: [{ id: { in: plan.voicePrints.map((row) => row.id) } }, voicePrintsWithoutConsentWhere] },
        });
    }
    if (plan.clips.length === 0) return [];
    if (!deletesClips()) {
        console.warn(`Not on production: ${plan.clips.length} voiceprint clip(s) left in place`);
        return [];
    }
    const failures: ClipFailure[] = [];
    for (const clip of await clipsWithoutConsent(plan.clips)) {
        const failure = await deleteObject(clip);
        if (failure) failures.push(failure);
    }
    return failures;
}

async function reportFailures(failures: ClipFailure[], context: string): Promise<void> {
    if (failures.length === 0) return;
    console.error(`Voice data not fully deleted (${context}):`, failures);
    await sendErrorAdminAlert({
        source: "Voiceprint deletion",
        error: `${failures.length} item(s) not deleted. The dry run of npm run voiceprints:delete-without-consent lists what is left.`,
        context: { context, first: `${failures[0].item}: ${failures[0].error}` },
    });
}

/**
 * Delete the voice data of the people in `scope` who have no consent in
 * force: after a withdrawal, after a claim that closed a consent, after a
 * refused voiceprint result, and after a person or a city delete. Call it
 * after the change has committed: it reads with the global client, so
 * inside the change's transaction it would still see the open period.
 *
 * Never throws: the change that caused it must stand. A failure is logged
 * and alerted, and the cleanup script removes what is left.
 */
export async function deleteVoiceDataWithoutConsent(scope: { personId: string } | { cityId: string }, context: string): Promise<ClipFailure[]> {
    let failures: ClipFailure[];
    try {
        // A missing id would widen the scope to every person.
        if (typeof ("personId" in scope ? scope.personId : scope.cityId) !== "string") throw new Error("No person or city id");
        // Where no clip is deleted, a listing would only raise alerts.
        const plan = await planVoiceDataDeletion(scope, { listClips: deletesClips() });
        failures = [...plan.listFailures, ...await runVoiceDataDeletion(plan)];
    } catch (error) {
        failures = [{ item: `voice data (${context})`, error: errorMessage(error) }];
    }
    await reportFailures(failures, context);
    return failures;
}

/**
 * The admin's Delete button: one voiceprint, whatever the consent, with the
 * clip that it names. A failed row delete throws, so the admin sees that the
 * voiceprint is still there.
 */
export async function deleteVoicePrintById(voicePrintId: string): Promise<void> {
    const row = await prisma.voicePrint.findUnique({ where: { id: voicePrintId }, select: { sourceAudioUrl: true } });
    if (!row) return;
    await prisma.voicePrint.deleteMany({ where: { id: voicePrintId } });
    if (!deletesClips() || !isStorageConfigured()) return;
    const object = objectOf(row.sourceAudioUrl);
    if (!object || !object.key.startsWith(CLIP_ROOT)) return;
    const failure = await deleteObject(object);
    if (failure) await reportFailures([failure], `voiceprint ${voicePrintId} deleted`);
}
