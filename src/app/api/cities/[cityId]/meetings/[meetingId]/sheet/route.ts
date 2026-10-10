import { NextResponse } from 'next/server';
import { DataSource } from '@prisma/client';
import { z } from 'zod';
import { auth } from '@/auth';
import { getCurrentUser, withUserAuthorizedToEdit } from '@/lib/auth';
import { deleteFactSource, getLatestReadTasks, getMeetingFactSourceWithFile, getMeetingFactSources, replaceSheetFile } from '@/lib/db/meetingFactSources';
import { rederiveMeetingQuietly } from '@/lib/derivation/rederive';
import { isSheetMediaType, requestReadAttendanceSheetInternal } from '@/lib/tasks/meetingFacts';
import { deleteFile, readPrivateFile, uploadPrivateFile } from '@/lib/s3';
import { env } from '@/env.mjs';

/**
 * The meeting's attendance sheet (issue #807): upload, read, read again,
 * remove. Superadmin only in this round: the sheet carries the councillors'
 * signatures, and a read is a model call over an image.
 */
async function gate(cityId: string): Promise<NextResponse | null> {
    await withUserAuthorizedToEdit({ cityId });
    const user = await getCurrentUser();
    if (!user?.isSuperAdmin) return NextResponse.json({ error: 'Superadmin required' }, { status: 403 });
    return null;
}

const MAX_SHEET_BYTES = 20 * 1024 * 1024;
/**
 * The largest image the reader sends inline: 5 MB once base64-encoded. A larger
 * JPEG or PNG goes as a one-page PDF; a larger WebP or GIF cannot, so the
 * upload refuses it here, with the sentence the reader would fail with later.
 */
const MAX_INLINE_IMAGE_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4);
const INLINE_ONLY_TYPES = ['image/webp', 'image/gif'];

/** The meeting's sources other than the pages, and the sheet's file behind `?file=1` for the review card. */
export async function GET(request: Request, props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const params = await props.params;
    const denied = await gate(params.cityId);
    if (denied) return denied;
    const { searchParams } = new URL(request.url);
    if (searchParams.get('file') === '1') {
        const row = await getMeetingFactSourceWithFile(params.cityId, params.meetingId, DataSource.sheet);
        if (!row?.fileKey) return NextResponse.json({ error: 'No sheet' }, { status: 404 });
        const { body, contentType } = await readPrivateFile(row.fileKey);
        return new NextResponse(Buffer.from(body), {
            headers: { 'Content-Type': contentType ?? row.mediaType ?? 'application/octet-stream', 'Cache-Control': 'private, no-store' },
        });
    }
    const [sources, reads] = await Promise.all([getMeetingFactSources(params.cityId, params.meetingId), getLatestReadTasks(params.cityId, params.meetingId)]);
    return NextResponse.json({ sources, reads });
}

/** Upload a sheet. The earlier one, its reading and its confirmation go; the reader starts on the new file. */
export async function PUT(request: Request, props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const params = await props.params;
    const denied = await gate(params.cityId);
    if (denied) return denied;
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!isSheetMediaType(file.type)) return NextResponse.json({ error: 'The sheet must be a PDF, JPEG, PNG, WebP or GIF' }, { status: 400 });
    if (file.size > MAX_SHEET_BYTES) return NextResponse.json({ error: 'The sheet is larger than 20 MB' }, { status: 400 });
    if (INLINE_ONLY_TYPES.includes(file.type) && file.size > MAX_INLINE_IMAGE_BYTES) {
        return NextResponse.json({ error: `A ${file.type} sheet can be at most ${(MAX_INLINE_IMAGE_BYTES / 1024 / 1024).toFixed(1)} MB. Upload it as JPEG, PNG or PDF.` }, { status: 400 });
    }

    const session = await auth();
    const previous = await getMeetingFactSourceWithFile(params.cityId, params.meetingId, DataSource.sheet);
    const stored = await uploadPrivateFile(file, `attendance-sheets/${params.cityId}/${params.meetingId}`);
    const row = await replaceSheetFile(params.cityId, params.meetingId, { key: stored.key, name: file.name, mediaType: file.type }, session?.user?.id ?? null);
    if (previous?.fileKey && previous.fileKey !== stored.key) {
        await deleteFile(env.DO_SPACES_BUCKET, previous.fileKey).catch(error => console.error('Failed to delete the replaced sheet:', error));
    }
    // A replaced sheet's reading is gone, so the rows derived from it must go too.
    if (previous && previous.status !== 'uploaded') await rederiveMeetingQuietly(params.cityId, params.meetingId);

    // The upload stands even when the reader does not start; the page says so and offers a read again.
    let taskId: string | null = null;
    let error: string | null = null;
    try {
        taskId = (await requestReadAttendanceSheetInternal(params.cityId, params.meetingId)).id;
    } catch (cause) {
        console.error('Failed to start the sheet reader:', cause);
        error = cause instanceof Error ? cause.message : 'Failed to start the reader';
    }
    return NextResponse.json({ source: row, taskId, error });
}

const postSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('reread') }),
]);

/** Run the reader again on the same file: after a prompt change, or a failed run. */
export async function POST(request: Request, props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const params = await props.params;
    const denied = await gate(params.cityId);
    if (denied) return denied;
    const parsed = postSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    try {
        const task = await requestReadAttendanceSheetInternal(params.cityId, params.meetingId, { forceRead: true });
        return NextResponse.json({ taskId: task.id });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to start the reader' }, { status: 409 });
    }
}

/** Remove the sheet, its reading and everything derived from it. */
export async function DELETE(request: Request, props: { params: Promise<{ cityId: string; meetingId: string }> }) {
    const params = await props.params;
    const denied = await gate(params.cityId);
    if (denied) return denied;
    const fileKey = await deleteFactSource(params.cityId, params.meetingId, DataSource.sheet);
    if (fileKey) await deleteFile(env.DO_SPACES_BUCKET, fileKey).catch(error => console.error('Failed to delete the sheet file:', error));
    await rederiveMeetingQuietly(params.cityId, params.meetingId);
    return NextResponse.json({ success: true });
}
