import { NextRequest, NextResponse, after } from 'next/server';
import { getSubjectTopicForImage } from '@/lib/db/subject';
import { getCurrentUser } from '@/lib/auth';
import {
    generateImageForSubject,
    generateImageForSubjectInBackground,
    isSubjectImageGenerationEnabled,
    resolveSubjectImage,
    storeSubjectImage,
} from '@/lib/subjectImages';
import { subjectImageFallbackSvg } from '@/lib/subjectImageFallback';

/**
 * A subject's illustration.
 *
 * GET redirects to the stored image, or serves the topic-coloured SVG fallback
 * and asks for the image in the background, so old subjects get theirs as
 * people look at them. The redirect is cacheable for a few minutes: Cloudflare
 * then absorbs the repeat loads a landing page of cards makes, and the ETag in
 * the target URL keeps a replaced image from ever being served stale. Admins
 * bust the browser copy with a query parameter after they change an image.
 */

const REDIRECT_CACHE = 'public, max-age=300, s-maxage=300';
const FALLBACK_CACHE = 'public, max-age=60, s-maxage=60';

/** Anything sharp can read; sharp normalises it to WebP on store. */
const UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

type RouteContext = { params: Promise<{ subjectId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
    const { subjectId } = await context.params;

    // A bucket that cannot be reached (bad credentials on a preview, an outage)
    // must not break every card on the page: serve the placeholder, and do
    // not queue a generation that would fail at the same store.
    let lookupFailed = false;
    let resolved = null;
    try {
        resolved = await resolveSubjectImage(subjectId);
    } catch (error) {
        lookupFailed = true;
        console.error(`Subject image lookup failed for ${subjectId}:`, error);
    }
    if (resolved) {
        return NextResponse.redirect(resolved.url, { status: 302, headers: { 'Cache-Control': REDIRECT_CACHE } });
    }

    const subject = await getSubjectTopicForImage(subjectId);
    if (!subject) {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    if (!lookupFailed && isSubjectImageGenerationEnabled()) {
        after(() => generateImageForSubjectInBackground(subjectId));
    }

    return new NextResponse(subjectImageFallbackSvg(subject.topic), {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': FALLBACK_CACHE },
    });
}

export async function POST(request: NextRequest, context: RouteContext) {
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { subjectId } = await context.params;
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const file = (await request.formData()).get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        if (!UPLOAD_TYPES.has(file.type)) {
            return NextResponse.json({ error: `Unsupported image type ${file.type}` }, { status: 400 });
        }
        if (file.size > UPLOAD_MAX_BYTES) {
            return NextResponse.json({ error: 'Image exceeds 10 MB' }, { status: 400 });
        }
        await storeSubjectImage(subjectId, Buffer.from(await file.arrayBuffer()));
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
        return NextResponse.json({ ok: true, mode: 'generate', outcome });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Image generation failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
