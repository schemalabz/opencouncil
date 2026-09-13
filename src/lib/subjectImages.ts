import 'server-only';
import { buildPrompt, generate, listStoredSubjectIds, resolve, store, toWebp, type ResolvedImage } from '@opencouncil/subject-images';
import { env } from '@/env.mjs';
import { cacheAcquire, cacheDelete, cacheGetJSON, cacheSetJSON, isCacheConfigured } from '@/lib/cache/valkey';
import { getSubjectIdsForMeeting, getSubjectPromptInput } from '@/lib/db/subject';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { getRealmDisplayName } from '@/lib/realm';
import { s3Client } from '@/lib/s3';
import { sendErrorAdminAlert } from '@/lib/discord-core';

/**
 * The app-side face of `@opencouncil/subject-images`: wires the library to the
 * Spaces client, the bucket and the Gemini key, and owns the guards a
 * fire-and-forget pipeline needs — no duplicate generations for one subject,
 * no retry storm for a subject Gemini keeps refusing, and no generation that
 * paints over what an admin uploaded while the model drew.
 *
 * The guards are markers in Valkey, so they hold across containers and expire
 * on their own: the claim of a container that died mid-run releases with its
 * TTL, and a refused subject is left alone for a month rather than retried
 * every ten minutes for the life of a process. Without CACHE_URL (dev,
 * previews) there are no markers, and the in-process map below is the only
 * in-flight guard — enough for one container. With CACHE_URL, a claim that
 * Valkey cannot record is no claim: the run stands down, so an outage does
 * not let every container draw the same subject.
 */

/** How long a failed subject waits before a page view may retry it. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
/** Failures in a row before a subject is given up on; the prompt refuses some subjects for good. */
const GIVE_UP_AFTER = 3;
/** How long the failure count is kept, so the retries can add up to a give-up. */
const FAILURE_TTL_S = 24 * 60 * 60;
/** How long a given-up subject is left alone. */
const GIVE_UP_TTL_S = 30 * 24 * 60 * 60;
/** Longer than a generation takes; releases the claim of a container that died mid-run. */
const IN_FLIGHT_TTL_S = 3 * 60;
/** How often a forced run asks again for a claim another container holds. */
const CLAIM_POLL_MS = 1000;
/** One Discord alert per window for a bucket that cannot be read, not one per card per page view. */
const LOOKUP_ALERT_TTL_S = 10 * 60;
/** How long every generation pauses after the bucket refused a write: one billed call and one alert, not one per subject. */
const STORE_BROKEN_TTL_S = 10 * 60;
/** Generations run at once when a meeting's subjects are processed together. */
const MEETING_CONCURRENCY = 3;
/** How long every generation pauses after Gemini answered 429: the daily cap resets once a day, and every attempt meanwhile is a billed refusal. */
const QUOTA_PAUSE_S = 60 * 60;

/** This process's runs; the Valkey claim is what the other containers see. */
const inFlight = new Map<string, Promise<GenerateOutcome>>();
/** When this process last alerted on a lookup failure: the marker's stand-in without CACHE_URL. */
let lookupAlertedAt = 0;
/** Until when this process pauses after a quota 429: the marker's stand-in without CACHE_URL. */
let quotaPausedUntil = 0;

type FailureRecord = { count: number; at: number };

const inFlightKey = (subjectId: string) => `subject-images:in-flight:${subjectId}`;
const failureKey = (subjectId: string) => `subject-images:failed:${subjectId}`;
const LOOKUP_ALERT_KEY = 'subject-images:lookup-alerted';
const STORE_BROKEN_KEY = 'subject-images:store-broken';
const QUOTA_KEY = 'subject-images:quota-exhausted';

export type GenerateOutcome =
    | 'generated'
    /** an object was already there, and the run was not forced */
    | 'exists'
    /** something else wrote the object while the model drew; that write is kept */
    | 'superseded'
    | 'in-flight'
    | 'recent-failure'
    /** failed GIVE_UP_AFTER times in a row; left alone until the record expires */
    | 'refused'
    /** the bucket refused a write minutes ago; nothing is drawn until that pause ends */
    | 'store-unavailable'
    /** Valkey is configured but could not record the claim; nothing is drawn until it can */
    | 'unguarded'
    /** Gemini answered 429 within the hour; nothing is drawn until the pause ends */
    | 'quota-exhausted'
    | 'disabled';

function storeDeps() {
    return { client: s3Client, bucket: env.DO_SPACES_BUCKET, prefix: env.SUBJECT_IMAGES_PREFIX };
}

function resolveDeps() {
    return { ...storeDeps(), publicBaseUrl: env.CDN_URL.replace(/\/+$/, '') };
}

function sleep(ms: number): Promise<void> {
    return new Promise((done) => setTimeout(done, ms));
}

/** Log and alert Discord; the alert's own failure must not surface. */
function reportFailure(message: string, error: unknown, context: Record<string, string>): void {
    console.error(`${message}:`, error);
    const detail = error instanceof Error ? error.message : String(error);
    sendErrorAdminAlert({ source: 'subject-images', error: detail, context })
        .catch((alertError) => console.error('Failed to send subject image alert:', alertError));
}

/** Generation is on wherever a Gemini key is set; previews and dev without one serve only misses. */
export function isSubjectImageGenerationEnabled(): boolean {
    return Boolean(env.GEMINI_API_KEY);
}

export function resolveSubjectImage(subjectId: string): Promise<ResolvedImage | null> {
    return resolve(subjectId, resolveDeps());
}

/**
 * Store an admin-supplied image, normalised to the canonical WebP. Throws
 * UnreadableImageError for bytes that are not a raster or that would decode
 * past the pixel limit; the route answers 400 for that.
 */
export async function storeSubjectImage(subjectId: string, image: Buffer): Promise<void> {
    await store(subjectId, await toWebp(image), storeDeps());
}

/** Every subject that has an image, for the backfill to skip. One request per 1,000 objects. */
export function listSubjectsWithImages(): Promise<Set<string>> {
    return listStoredSubjectIds(storeDeps());
}

/**
 * The bucket could not be read (bad credentials, a wrong region, an outage).
 * The read route serves misses meanwhile; this makes sure someone hears about
 * it — once per window, not once per card per page view.
 */
export async function reportLookupFailure(subjectId: string, error: unknown): Promise<void> {
    const claim = await cacheAcquire(LOOKUP_ALERT_KEY, LOOKUP_ALERT_TTL_S);
    const windowOpen = Date.now() - lookupAlertedAt >= LOOKUP_ALERT_TTL_S * 1000;
    if (claim === 'acquired' || (claim === 'unavailable' && windowOpen)) {
        lookupAlertedAt = Date.now();
        reportFailure(`Subject image lookup failed for ${subjectId}`, error, { subjectId });
    } else {
        console.error(`Subject image lookup failed for ${subjectId}:`, error);
    }
}

/** The stored image, or null; a bucket that cannot be read is alerted once per window and the error rethrown. */
async function lookup(subjectId: string): Promise<ResolvedImage | null> {
    try {
        return await resolveSubjectImage(subjectId);
    } catch (error) {
        await reportLookupFailure(subjectId, error);
        throw error;
    }
}

/** Whether the quota pause is on: the marker with Valkey, this process's memory without. */
async function quotaPaused(): Promise<boolean> {
    return isCacheConfigured() ? Boolean(await cacheGetJSON(QUOTA_KEY)) : Date.now() < quotaPausedUntil;
}

/** A 429 from Gemini: the project's daily cap or its spend-based limit, never the subject's fault. */
function isQuotaError(error: unknown): boolean {
    const status = (error as { status?: unknown })?.status;
    const message = error instanceof Error ? error.message : String(error);
    return status === 429 || /"code":\s*429|RESOURCE_EXHAUSTED/.test(message);
}

/** Why a subject must not be drawn now, or null when it may be. */
async function heldBack(subjectId: string): Promise<'recent-failure' | 'refused' | 'store-unavailable' | 'quota-exhausted' | null> {
    if (await quotaPaused()) return 'quota-exhausted';
    if (await cacheGetJSON(STORE_BROKEN_KEY)) return 'store-unavailable';
    const failure = await cacheGetJSON<FailureRecord>(failureKey(subjectId));
    if (!failure) return null;
    if (failure.count >= GIVE_UP_AFTER) return 'refused';
    return Date.now() - failure.at < RETRY_AFTER_MS ? 'recent-failure' : null;
}

async function recordFailure(subjectId: string, error: unknown): Promise<void> {
    const previous = await cacheGetJSON<FailureRecord>(failureKey(subjectId));
    const count = (previous?.count ?? 0) + 1;
    const gaveUp = count >= GIVE_UP_AFTER;
    await cacheSetJSON(failureKey(subjectId), { count, at: Date.now() }, gaveUp ? GIVE_UP_TTL_S : FAILURE_TTL_S);
    const message = gaveUp
        ? `Subject image generation failed for ${subjectId}; giving up after ${count} attempts`
        : `Subject image generation failed for ${subjectId} (attempt ${count} of ${GIVE_UP_AFTER})`;
    reportFailure(message, error, { subjectId, attempt: String(count) });
}

/** Draw and store one subject; `before` is the object that was there when the run was claimed. */
async function generateAndStore(subjectId: string, apiKey: string, before: ResolvedImage | null): Promise<GenerateOutcome> {
    const subject = await getSubjectPromptInput(subjectId);
    if (!subject) {
        // Alerted, not counted: the subject is gone, not refused.
        const error = new Error(`Subject ${subjectId} not found`);
        reportFailure(`Subject image generation failed for ${subjectId}`, error, { subjectId });
        throw error;
    }

    // Descriptions carry markdown and REF:UTTERANCE links; the model should
    // read the sentence, not the markup. The scene is set in the subject's city.
    const prompt = buildPrompt({
        title: stripMarkdown(subject.name),
        description: stripMarkdown(subject.description),
        city: subject.councilMeeting.city.name_en || subject.councilMeeting.city.name,
        country: getRealmDisplayName(subject.councilMeeting.city.realm, 'en'),
    });
    let image: Buffer;
    try {
        image = await generate(prompt, { apiKey });
    } catch (error) {
        if (isQuotaError(error)) {
            // The cap is the project's, not the subject's: one pause and one
            // alert, instead of a billed 429 per subject until the day resets.
            const first = !(await quotaPaused());
            if (isCacheConfigured()) await cacheSetJSON(QUOTA_KEY, { at: Date.now() }, QUOTA_PAUSE_S);
            else quotaPausedUntil = Date.now() + QUOTA_PAUSE_S * 1000;
            if (first) reportFailure(`Subject image generation paused for ${QUOTA_PAUSE_S / 60} minutes: Gemini quota exhausted (at ${subjectId})`, error, { subjectId });
            throw error;
        }
        // The failure budget counts the model's refusals, which are about the
        // subject; a bucket or a database that is down is not held against it.
        await recordFailure(subjectId, error);
        throw error;
    }

    // The model takes tens of seconds. An admin who uploaded meanwhile keeps
    // their file: the ETag in the URL says whether the object changed. The
    // window between this check and the write is milliseconds, not seconds.
    const after = await resolveSubjectImage(subjectId);
    if (after?.url !== before?.url) return 'superseded';

    try {
        await store(subjectId, image, storeDeps());
    } catch (error) {
        // A bucket that refuses one write (missing, wrong key) refuses them
        // all. HeadObject cannot tell a missing bucket from a missing object,
        // so this is where it shows; pausing here keeps a misconfiguration
        // at one billed call and one alert instead of one per subject.
        await cacheSetJSON(STORE_BROKEN_KEY, { at: Date.now() }, STORE_BROKEN_TTL_S);
        reportFailure(`Subject image store failed for ${subjectId}`, error, { subjectId });
        throw error;
    }
    await cacheDelete(failureKey(subjectId));
    return 'generated';
}

/**
 * Generate and store the image for one subject.
 *
 * Without `force` an existing object is kept, so the summarize run costs
 * nothing for what the agenda run already drew; a subject already being drawn,
 * one that failed in the last ten minutes, and one given up on are reported
 * rather than drawn. With `force` the object is replaced, which is also how an
 * admin undoes a manual upload; a forced run waits for any run in progress,
 * here or in another container, so the forced image is the one that lands
 * last. Either way a write that landed while the model drew is kept. Throws on
 * failure after alerting Discord; background callers catch, the admin route
 * turns it into a 500.
 */
export async function generateImageForSubject(subjectId: string, options: { force?: boolean } = {}): Promise<GenerateOutcome> {
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) return 'disabled';
    const force = Boolean(options.force);

    let running = inFlight.get(subjectId);
    if (running && !force) return 'in-flight';
    while (running) {
        await running.catch(() => undefined);
        running = inFlight.get(subjectId);
    }

    // Registered before the first await, so two calls in one tick cannot both
    // pass the check above — the only guard there is without CACHE_URL.
    const run = claimAndGenerate(subjectId, apiKey, force);
    inFlight.set(subjectId, run);
    try {
        return await run;
    } finally {
        if (inFlight.get(subjectId) === run) inFlight.delete(subjectId);
    }
}

/** The cheap checks, the cross-container claim, then the run itself. */
async function claimAndGenerate(subjectId: string, apiKey: string, force: boolean): Promise<GenerateOutcome> {
    let before: ResolvedImage | null = null;
    if (!force) {
        // The object first: the summarize run asks again for every subject the agenda run drew.
        before = await lookup(subjectId);
        if (before) return 'exists';
        const held = await heldBack(subjectId);
        if (held) return held;
    }

    let claim = await cacheAcquire(inFlightKey(subjectId), IN_FLIGHT_TTL_S);
    while (claim === 'held') {
        if (!force) return 'in-flight';
        await sleep(CLAIM_POLL_MS);
        claim = await cacheAcquire(inFlightKey(subjectId), IN_FLIGHT_TTL_S);
    }
    // Without CACHE_URL the in-process map is the guard, and enough for one container.
    if (claim === 'unavailable' && isCacheConfigured()) return 'unguarded';

    try {
        return await generateAndStore(subjectId, apiKey, force ? await lookup(subjectId) : before);
    } finally {
        await cacheDelete(inFlightKey(subjectId));
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
