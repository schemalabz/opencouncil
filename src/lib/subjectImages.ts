import { buildPrompt, generate, resolve, store, toWebp, type ResolvedImage } from '@opencouncil/subject-images';
import { env } from '@/env.mjs';
import { getSubjectIdsForMeeting, getSubjectPromptInput } from '@/lib/db/subject';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { s3Client } from '@/lib/s3';
import { sendErrorAdminAlert } from '@/lib/discord';

/**
 * The app-side face of `@opencouncil/subject-images`: wires the library to the
 * Spaces client, the bucket and the Gemini key, and owns the two guards a
 * fire-and-forget pipeline needs — no duplicate generations for one subject,
 * and no retry storm for a subject Gemini keeps refusing.
 *
 * Both guards are process-local. A deployment with several app containers
 * can draw one subject once per container in the seconds before the object
 * lands, and retry a refused subject once per container per back-off window.
 * That bound is one image per subject per container, which does not justify
 * a shared lock.
 */

/** How long a failed subject waits before a page view may retry it. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
/** Generations run at once when a meeting's subjects are processed together. */
const MEETING_CONCURRENCY = 3;

const inFlight = new Set<string>();
const failedAt = new Map<string, number>();

export type GenerateOutcome = 'generated' | 'exists' | 'in-flight' | 'recent-failure' | 'disabled';

function storeDeps() {
    return { client: s3Client, bucket: env.DO_SPACES_BUCKET, prefix: env.SUBJECT_IMAGES_PREFIX };
}

function resolveDeps() {
    return { ...storeDeps(), publicBaseUrl: env.CDN_URL.replace(/\/$/, '') };
}

/** Log and alert Discord; the alert's own failure must not surface. */
function reportFailure(message: string, error: unknown, context: Record<string, string>): void {
    console.error(`${message}:`, error);
    const detail = error instanceof Error ? error.message : String(error);
    sendErrorAdminAlert({ source: 'subject-images', error: detail, context })
        .catch((alertError) => console.error('Failed to send subject image alert:', alertError));
}

/** Generation is on wherever a Gemini key is set; previews and dev without one serve only fallbacks. */
export function isSubjectImageGenerationEnabled(): boolean {
    return Boolean(env.GEMINI_API_KEY);
}

export function resolveSubjectImage(subjectId: string): Promise<ResolvedImage | null> {
    return resolve(subjectId, resolveDeps());
}

/** Store an admin-supplied image. Any format sharp reads; normalised to the canonical WebP. */
export async function storeSubjectImage(subjectId: string, image: Buffer): Promise<void> {
    await store(subjectId, await toWebp(image), storeDeps());
}

/**
 * Generate and store the image for one subject.
 *
 * Without `force` an existing object is kept, so the summarize run costs
 * nothing for what the agenda run already drew. With `force` the object is
 * replaced, which is also how an admin undoes a manual upload. Throws on
 * failure after alerting Discord; background callers catch, the admin route
 * turns it into a 500.
 */
export async function generateImageForSubject(subjectId: string, options: { force?: boolean } = {}): Promise<GenerateOutcome> {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) return 'disabled';
    if (inFlight.has(subjectId)) return 'in-flight';

    const lastFailure = failedAt.get(subjectId);
    if (!options.force && lastFailure !== undefined && Date.now() - lastFailure < RETRY_AFTER_MS) {
        return 'recent-failure';
    }

    inFlight.add(subjectId);
    try {
        if (!options.force && await resolveSubjectImage(subjectId)) return 'exists';

        const subject = await getSubjectPromptInput(subjectId);
        if (!subject) throw new Error(`Subject ${subjectId} not found`);

        // Descriptions carry markdown and REF:UTTERANCE links; the model should
        // read the sentence, not the markup.
        const prompt = buildPrompt({ title: stripMarkdown(subject.name), description: stripMarkdown(subject.description) });
        const image = await generate(prompt, { apiKey });
        await store(subjectId, image, storeDeps());
        failedAt.delete(subjectId);
        return 'generated';
    } catch (error) {
        failedAt.set(subjectId, Date.now());
        reportFailure(`Subject image generation failed for ${subjectId}`, error, { subjectId });
        throw error;
    } finally {
        inFlight.delete(subjectId);
    }
}

/** Fire-and-forget variant for the read route: never rejects. */
export function generateImageForSubjectInBackground(subjectId: string): Promise<void> {
    return generateImageForSubject(subjectId).then(() => undefined, () => undefined);
}

/**
 * Generate images for every subject of a meeting, a few at a time. Subjects
 * that already have an object are skipped inside generateImageForSubject.
 * Never rejects: the callers do not await it, so a rejection here would be
 * an unhandled one. Each failure, the subject lookup included, is alerted on
 * its own.
 */
export async function generateImagesForMeeting(cityId: string, councilMeetingId: string): Promise<void> {
    if (!isSubjectImageGenerationEnabled()) return;

    let queue: string[];
    try {
        queue = await getSubjectIdsForMeeting(cityId, councilMeetingId);
    } catch (error) {
        reportFailure(`Subject lookup for images failed for meeting ${councilMeetingId}`, error, { cityId, councilMeetingId });
        return;
    }

    const worker = async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
            await generateImageForSubjectInBackground(id);
        }
    };
    await Promise.all(Array.from({ length: Math.min(MEETING_CONCURRENCY, queue.length) }, worker));
}
