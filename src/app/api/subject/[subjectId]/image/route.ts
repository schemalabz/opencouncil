import { NextRequest, NextResponse, after } from 'next/server';
import { UnreadableImageError, isSubjectImageId } from '@opencouncil/subject-images';
import { subjectExists } from '@/lib/db/subject';
import { getCurrentUser } from '@/lib/auth';
import { MAX_IMAGE_BYTES } from '@/lib/utils/imageUpload';
import {
    generateImageForSubject,
    generateImageForSubjectInBackground,
    isSubjectImageGenerationEnabled,
    reportLookupFailure,
    resolveSubjectImage,
    storeSubjectImage,
} from '@/lib/subjectImages';

/**
 * A subject's illustration.
 *
 * GET redirects to the stored image, or answers 404 and asks for the image in
 * the background, so old subjects get theirs as people look at them. The
 * <img> that got the 404 hides itself and leaves the topic placeholder the
 * browser drew under it. The redirect is cacheable for a few minutes: Cloudflare
 * then absorbs the repeat loads a landing page of cards makes, and the ETag in
 * the target URL keeps a replaced image from ever being served stale. Admins
 * bust the browser copy with a query parameter after they change an image.
 */

const REDIRECT_CACHE = 'public, max-age=300, s-maxage=300';
const MISS_CACHE = 'public, max-age=60, s-maxage=60';

type RouteContext = { params: Promise<{ subjectId: string }> };

/** The id names an object in the bucket before it is looked up, so it is checked before anything else. */
function invalidId(subjectId: string) {
    return isSubjectImageId(subjectId) ? null : NextResponse.json({ error: 'Invalid subject id' }, { status: 400 });
}

export async function GET(_request: NextRequest, context: RouteContext) {
    const { subjectId } = await context.params;
    const invalid = invalidId(subjectId);
    if (invalid) return invalid;

    // A bucket that cannot be reached (bad credentials on a preview, an outage)
    // must not break every card on the page: answer as a miss, and do not
    // queue a generation that would fail at the same store.
    let lookupFailed = false;
    let resolved = null;
    try {
        resolved = await resolveSubjectImage(subjectId);
    } catch (error) {
        lookupFailed = true;
        await reportLookupFailure(subjectId, error);
    }
    if (resolved) {
        return NextResponse.redirect(resolved.url, { status: 302, headers: { 'Cache-Control': REDIRECT_CACHE } });
    }

    if (!(await subjectExists(subjectId))) {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    if (!lookupFailed && isSubjectImageGenerationEnabled()) {
        after(() => generateImageForSubjectInBackground(subjectId));
    }

    return NextResponse.json({ error: 'No image yet' }, { status: 404, headers: { 'Cache-Control': MISS_CACHE } });
}

export async function POST(request: NextRequest, context: RouteContext) {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { subjectId } = await context.params;
    const invalid = invalidId(subjectId);
    if (invalid) return invalid;
    // Either branch writes a permanent, public object under this id.
    if (!(await subjectExists(subjectId))) {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const file = (await request.formData()).get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        if (file.size > MAX_IMAGE_BYTES) {
            return NextResponse.json({ error: `Image exceeds ${MAX_IMAGE_BYTES / (1024 * 1024)} MB` }, { status: 400 });
        }
        // The declared type is whatever the client set. The library reads the
        // real one from the bytes, so nothing that is not a raster reaches sharp.
        try {
            await storeSubjectImage(subjectId, Buffer.from(await file.arrayBuffer()));
        } catch (error) {
            if (error instanceof UnreadableImageError) {
                return NextResponse.json({ error: error.message }, { status: 400 });
            }
            const message = error instanceof Error ? error.message : 'Image upload failed';
            return NextResponse.json({ error: message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, mode: 'upload' });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.mode !== 'generate') {
        return NextResponse.json({ error: 'Expected { mode: "generate" } or a multipart file upload' }, { status: 400 });
    }
    if (!isSubjectImageGenerationEnabled()) {
        return NextResponse.json({ error: 'Image generation is not configured (GEMINI_API_KEY)' }, { status: 503 });
    }

    try {
        const outcome = await generateImageForSubject(subjectId, { force: true });
        // A forced run only ever reports 'generated' or throws; anything else
        // means nothing was drawn, and the admin must not be told otherwise.
        if (outcome !== 'generated') {
            return NextResponse.json({ error: `Image was not regenerated (${outcome})`, outcome }, { status: 409 });
        }
        return NextResponse.json({ ok: true, mode: 'generate', outcome });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Image generation failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
