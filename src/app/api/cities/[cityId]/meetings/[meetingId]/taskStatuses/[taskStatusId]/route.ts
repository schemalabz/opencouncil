import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'crypto';
import { handleTaskUpdate } from '@/lib/tasks/tasks';
import { taskHandlers } from '@/lib/tasks/registry';
import { TaskUpdate } from '@/lib/apiTypes';
import { deleteTaskStatus, getTaskStatus } from '@/lib/db/tasks';
import { env } from '@/env.mjs';

type RouteParams = { cityId: string; meetingId: string; taskStatusId: string };

let warnedAboutMissingSecret = false;

/**
 * Optional callback authentication for state-changing methods.
 *
 * When `TASK_CALLBACK_SECRET` is set, requires `Authorization: Bearer <secret>` and
 * compares in constant time. When unset (or whitespace-only) the check is skipped with a
 * loud warning, so the endpoint stays backwards-compatible until ops both set the env var
 * and reconfigure the task backend to send the header.
 *
 * Returns `null` when the request may proceed, or a 401 response when it must be rejected.
 */
function authorizeCallback(request: NextRequest): NextResponse | null {
    const secret = env.TASK_CALLBACK_SECRET?.trim();

    if (!secret) {
        if (!warnedAboutMissingSecret) {
            console.warn(
                '[taskStatuses] TASK_CALLBACK_SECRET is not set — task callback authentication is DISABLED. ' +
                'Set it and configure the task backend to send "Authorization: Bearer <secret>" to close this gap.'
            );
            warnedAboutMissingSecret = true;
        }
        return null;
    }

    const header = request.headers.get('authorization')?.trim() ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const token = match?.[1]?.trim();

    if (!token || !constantTimeEquals(token, secret)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return null;
}

function constantTimeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    // timingSafeEqual throws on unequal lengths; guard first (length is not secret here).
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest, props: { params: Promise<RouteParams> }) {
    const { cityId, meetingId, taskStatusId } = await props.params;
    const taskStatus = await getTaskStatus(taskStatusId, { cityId, councilMeetingId: meetingId });
    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    return NextResponse.json(taskStatus);
}

export async function POST(request: NextRequest, props: { params: Promise<RouteParams> }) {
    const { cityId, meetingId, taskStatusId } = await props.params;
    return handleUpdateRequest(request, { cityId, councilMeetingId: meetingId }, taskStatusId);
}

export async function PUT(request: NextRequest, props: { params: Promise<RouteParams> }) {
    const { cityId, meetingId, taskStatusId } = await props.params;
    return handleUpdateRequest(request, { cityId, councilMeetingId: meetingId }, taskStatusId);
}

export async function DELETE(request: NextRequest, props: { params: Promise<RouteParams> }) {
    const { cityId, meetingId, taskStatusId } = await props.params;

    const authError = authorizeCallback(request);
    if (authError) {
        return authError;
    }

    const scope = { cityId, councilMeetingId: meetingId };
    const taskStatus = await getTaskStatus(taskStatusId, scope);

    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (taskStatus.updatedAt > tenMinutesAgo) {
        return NextResponse.json({ error: 'Cannot delete task that has been updated within the last 10 minutes' }, { status: 403 });
    }

    const deleted = await deleteTaskStatus(taskStatusId, scope);
    if (deleted === 0) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    revalidateTag(`city:${taskStatus.cityId}:meeting:${taskStatus.councilMeetingId}:derived`, 'max');

    return NextResponse.json({ message: 'Task status deleted successfully' });
}

async function handleUpdateRequest(
    request: NextRequest,
    scope: { cityId: string; councilMeetingId: string },
    taskStatusId: string
) {
    const authError = authorizeCallback(request);
    if (authError) {
        return authError;
    }

    const taskStatus = await getTaskStatus(taskStatusId, scope);

    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    const update: TaskUpdate<any> = await request.json();

    try {
        const handler = taskHandlers[taskStatus.type];
        if (!handler) {
            throw new Error(`Unsupported task type: ${taskStatus.type}`);
        }

        await handleTaskUpdate(taskStatusId, update, handler);

        return NextResponse.json({ message: 'Task status updated successfully' });
    } catch (error) {
        console.error('Error updating task status:', error);
        return NextResponse.json({ error: 'Failed to update task status' }, { status: 500 });
    }
}
