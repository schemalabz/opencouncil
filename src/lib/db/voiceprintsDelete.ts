/**
 * Deletion of a person's voice data: the voiceprint rows and the audio clips
 * that the task server cut for them.
 *
 * Not a "use server" file: the withdrawals, the claim, the person and city
 * deletes and the cleanup script call it with no session to gate on. The
 * admin's Delete button goes through deleteVoicePrint in voiceprints.ts,
 * which authorizes first.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { env } from "@/env.mjs";
import { deleteFile, isStorageConfigured, listObjectKeys } from "@/lib/s3";
import { spacesObjectFromUrl, type SpacesObject } from "@/lib/utils/spacesUrl";
import { voicePrintConsentInForce, voicePrintsWithoutConsentWhere } from "@/lib/db/voicePrintConsentRule";
import { findVoiceprintTasks } from "@/lib/db/voiceprintTasks";
import { sendErrorAdminAlert } from "@/lib/discord-core";

/**
 * Where the task server puts every clip: `voiceprints/{cityId}/{personId}/{random}_v1.mp3`
 * (opencouncil-tasks, generateVoiceprint.ts). A person's folder holds all of
 * their clips, also those that no row names any more.
 */
const CLIP_ROOT = "voiceprints/";
const KEY_PART = /^[A-Za-z0-9_-]+$/;

/**
 * `voiceprints/{cityId}/` or `voiceprints/{cityId}/{personId}/`. The parts
 * are checked: an empty or a `/` part would widen the folder to other people.
 * The trailing `/` keeps person `p1` from matching `p10`.
 */
export function voiceprintClipFolder(cityId: string, personId?: string): string {
    for (const part of personId === undefined ? [cityId] : [cityId, personId]) {
        if (!KEY_PART.test(part)) throw new Error(`Not a part of a voiceprint clip key: "${part}"`);
    }
    return `${CLIP_ROOT}${cityId}/${personId === undefined ? "" : `${personId}/`}`;
}

export type ClipFailure = { clip: string; error: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const unique = <T,>(values: T[]) => [...new Set(values)];

const bucketOf = (url: string) => spacesObjectFromUrl(url, { bucket: env.DO_SPACES_BUCKET, cdnUrl: env.CDN_URL })?.bucket;

async function deleteObject({ bucket, key }: SpacesObject): Promise<ClipFailure | null> {
    try {
        await deleteFile(bucket, key);
        return null;
    } catch (error) {
        return { clip: `${bucket}/${key}`, error: errorText(error) };
    }
}

/**
 * Remove a clip from the bucket that its URL names: the task server writes
 * to its own bucket, which on a preview is not the app's. Only an object in
 * the clip folder is touched; any other URL is nobody's to delete. Returns the
 * failure instead of throwing, so no caller can forget the catch.
 */
export async function deleteClip(sourceAudioUrl: string): Promise<ClipFailure | null> {
    const object = spacesObjectFromUrl(sourceAudioUrl, { bucket: env.DO_SPACES_BUCKET, cdnUrl: env.CDN_URL });
    if (!object || !object.key.startsWith(CLIP_ROOT)) {
        console.warn(`Voiceprint clip ${sourceAudioUrl} is not in the clip folder of a bucket; nothing to delete`);
        return null;
    }
    return deleteObject(object);
}

/** What a deletion removes, read before any of it goes: the rows and the tasks are what name the clips. */
export type VoiceData = {
    voicePrintIds: string[];
    clipUrls: string[];
    folders: SpacesObject[];
};

/**
 * The voice data of one person, or of every person of a city: their rows,
 * the clips that the rows and the generateVoiceprint tasks name, and the clip
 * folders in each bucket that those clips are in.
 */
export async function findVoiceData(scope: { personId: string } | { cityId: string }): Promise<VoiceData> {
    const byPerson = "personId" in scope;
    const [rows, tasks, person] = await Promise.all([
        prisma.voicePrint.findMany({
            where: byPerson ? { personId: scope.personId } : { person: { cityId: scope.cityId } },
            select: { id: true, sourceAudioUrl: true },
        }),
        findVoiceprintTasks(scope),
        byPerson ? prisma.person.findUnique({ where: { id: scope.personId }, select: { cityId: true } }) : null,
    ]);
    const clipUrls = unique([
        ...rows.map((row) => row.sourceAudioUrl),
        ...tasks.flatMap(({ result }) => (result?.audioUrl ? [result.audioUrl] : [])),
    ]);
    const buckets = unique([env.DO_SPACES_BUCKET, ...clipUrls.flatMap((url) => bucketOf(url) ?? [])]);
    const folderKeys = byPerson
        ? unique([...(person ? [person.cityId] : []), ...tasks.flatMap(({ request }) => (typeof request.cityId === "string" ? [request.cityId] : []))])
            .map((cityId) => voiceprintClipFolder(cityId, scope.personId))
        : [voiceprintClipFolder(scope.cityId)];
    return {
        voicePrintIds: rows.map((row) => row.id),
        clipUrls,
        folders: buckets.flatMap((bucket) => folderKeys.map((key) => ({ bucket, key }))),
    };
}

async function reportFailures(failures: ClipFailure[], context: string): Promise<void> {
    if (failures.length === 0) return;
    console.error(`Voice data not fully deleted (${context}):`, failures);
    try {
        await sendErrorAdminAlert({
            source: "Voiceprint deletion",
            error: `${failures.length} item(s) not deleted. For a person without a consent in force, the dry run of npm run voiceprints:delete-without-consent lists what is left.`,
            context: { context, first: `${failures[0].clip}: ${failures[0].error}` },
        });
    } catch (error) {
        console.error("Could not send the voiceprint deletion alert:", error);
    }
}

/**
 * Delete what findVoiceData found. The rows go first: a voiceprint that is
 * no longer in the table is one the transcribe request cannot send, whatever
 * happens to the clips after. If the rows cannot go, the clips stay, so that
 * no stored row names a missing clip. Then everything in the folders, and
 * last any named clip that the folders did not hold.
 *
 * Never throws: it runs after a withdrawal, a claim or a delete that has
 * committed, and that must stand. A failure is logged and alerted.
 */
export async function deleteVoiceData(data: VoiceData, context: string): Promise<ClipFailure[]> {
    const failures: ClipFailure[] = [];
    try {
        if (data.voicePrintIds.length > 0) {
            await prisma.voicePrint.deleteMany({ where: { id: { in: data.voicePrintIds } } });
        }
    } catch (error) {
        failures.push({ clip: "voiceprint rows", error: errorText(error) });
        await reportFailures(failures, context);
        return failures;
    }
    if (!isStorageConfigured()) {
        if (data.clipUrls.length > 0) console.warn(`No storage keys: ${data.clipUrls.length} voiceprint clip(s) left in place (${context})`);
        return failures;
    }

    const deleted = new Set<string>();
    for (const folder of data.folders) {
        let keys: string[];
        try {
            keys = await listObjectKeys(folder.bucket, folder.key);
        } catch (error) {
            failures.push({ clip: `${folder.bucket}/${folder.key}`, error: errorText(error) });
            continue;
        }
        for (const key of keys) {
            deleted.add(`${folder.bucket}/${key}`);
            const failure = await deleteObject({ bucket: folder.bucket, key });
            if (failure) failures.push(failure);
        }
    }
    for (const url of data.clipUrls) {
        const object = spacesObjectFromUrl(url, { bucket: env.DO_SPACES_BUCKET, cdnUrl: env.CDN_URL });
        if (object && deleted.has(`${object.bucket}/${object.key}`)) continue;
        const failure = await deleteClip(url);
        if (failure) failures.push(failure);
    }
    await reportFailures(failures, context);
    return failures;
}

/**
 * After a consent ends (a withdrawal, or a claim that closed one): delete the
 * person's voice data, if no consent is in force. A no-op while a period is
 * open: a superadmin's recorded period, for instance, survives the app's
 * tick. Call it after the consent change has committed, never inside its
 * transaction: this reads with the global client, so inside the transaction
 * it would still see the open period and delete nothing.
 */
export async function deleteVoiceDataWithoutConsent(personId: string): Promise<ClipFailure[]> {
    const context = `consent of person ${personId} ended`;
    try {
        // An empty id would drop the person filter below: refuse it before any read.
        if (!KEY_PART.test(personId)) throw new Error(`Not a person id: "${personId}"`);
        if (await prisma.person.count({ where: { id: personId, ...voicePrintConsentInForce } }) > 0) return [];
        return await deleteVoiceData(await findVoiceData({ personId }), context);
    } catch (error) {
        const failures = [{ clip: `voice data of person ${personId}`, error: errorText(error) }];
        await reportFailures(failures, context);
        return failures;
    }
}

/**
 * The admin's Delete button: one voiceprint, with its clip. A failed row
 * delete throws, so the admin sees that the voiceprint is still there.
 */
export async function deleteVoicePrintById(voicePrintId: string): Promise<ClipFailure[]> {
    const row = await prisma.voicePrint.findUnique({ where: { id: voicePrintId }, select: { sourceAudioUrl: true } });
    if (!row) return [];
    await prisma.voicePrint.deleteMany({ where: { id: voicePrintId } });
    return deleteVoiceData({ voicePrintIds: [], clipUrls: [row.sourceAudioUrl], folders: [] }, `voiceprint ${voicePrintId} deleted`);
}

const sweepRowSelect = {
    id: true,
    sourceAudioUrl: true,
    person: { select: { name: true, cityId: true } },
} satisfies Prisma.VoicePrintSelect;

export type SweepRow = Prisma.VoicePrintGetPayload<{ select: typeof sweepRowSelect }>;

export type Sweep = {
    /** The rows of people without a consent in force. */
    voicePrints: SweepRow[];
    /** Every object in the clip folder of a person without a consent in force, or of a person who no longer exists. */
    clips: SpacesObject[];
    /** Buckets that could not be listed: their clips are not in `clips`. */
    listFailures: ClipFailure[];
};

/** The person a key in the clip folder belongs to, or null for a key of another shape. */
function clipOwner(key: string): string | null {
    const [root, cityId, personId, file] = key.split("/");
    if (`${root}/` !== CLIP_ROOT || !file || !KEY_PART.test(cityId ?? "") || !KEY_PART.test(personId ?? "")) return null;
    return personId;
}

/** The ids among `personIds` with a consent in force. */
async function consentedAmong(personIds: string[]): Promise<Set<string>> {
    if (personIds.length === 0) return new Set();
    const people = await prisma.person.findMany({ where: { id: { in: personIds }, ...voicePrintConsentInForce }, select: { id: true } });
    return new Set(people.map((person) => person.id));
}

/** The clips whose owner has no consent in force (or no longer exists). */
async function clipsWithoutConsent(clips: SpacesObject[]): Promise<SpacesObject[]> {
    const consented = await consentedAmong(unique(clips.flatMap(({ key }) => clipOwner(key) ?? [])));
    return clips.filter(({ key }) => {
        const owner = clipOwner(key);
        return owner !== null && !consented.has(owner);
    });
}

/**
 * What the cleanup script deletes, in every city or in one: the rows of the
 * people without a consent in force, and every clip whose folder belongs to
 * such a person or to a person who no longer exists. The clips are found by
 * listing the folders, so a clip that no row names is found too. Reads only.
 */
export async function planVoiceDataSweep({ cityId }: { cityId?: string } = {}): Promise<Sweep> {
    const prefix = cityId === undefined ? CLIP_ROOT : voiceprintClipFolder(cityId);
    const voicePrints = await prisma.voicePrint.findMany({
        where: { AND: [voicePrintsWithoutConsentWhere, ...(cityId === undefined ? [] : [{ person: { cityId } }])] },
        select: sweepRowSelect,
        orderBy: [{ person: { cityId: "asc" } }, { createdAt: "asc" }],
    });
    if (!isStorageConfigured()) {
        return { voicePrints, clips: [], listFailures: [{ clip: "every bucket", error: "No storage keys: the clips were not listed" }] };
    }
    const urls = await prisma.voicePrint.findMany({ select: { sourceAudioUrl: true } });
    const buckets = unique([env.DO_SPACES_BUCKET, ...urls.flatMap((row) => bucketOf(row.sourceAudioUrl) ?? [])]);

    const listed: SpacesObject[] = [];
    const listFailures: ClipFailure[] = [];
    for (const bucket of buckets) {
        try {
            for (const key of await listObjectKeys(bucket, prefix)) listed.push({ bucket, key });
        } catch (error) {
            listFailures.push({ clip: `${bucket}/${prefix}`, error: errorText(error) });
        }
    }
    return { voicePrints, clips: await clipsWithoutConsent(listed), listFailures };
}

/**
 * Delete what planVoiceDataSweep found: the rows first, then the clips. Both
 * are checked against the consent again, so a consent given since the plan
 * keeps its voiceprint and its clips.
 */
export async function runVoiceDataSweep(sweep: Sweep): Promise<ClipFailure[]> {
    await prisma.voicePrint.deleteMany({
        where: { AND: [{ id: { in: sweep.voicePrints.map((row) => row.id) } }, voicePrintsWithoutConsentWhere] },
    });
    const failures: ClipFailure[] = [];
    for (const clip of await clipsWithoutConsent(sweep.clips)) {
        const failure = await deleteObject(clip);
        if (failure) failures.push(failure);
    }
    return failures;
}
