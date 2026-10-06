import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { handleTaskUpdate } from '@/lib/tasks/tasks';
import { taskHandlers } from '@/lib/tasks/registry';
import { TaskUpdate } from '@/lib/apiTypes';
import { deleteTaskStatusDirect, getTaskStatusDirect, type TaskStatusScope } from '@/lib/db/tasksInternal';
import { verifyCallbackToken } from '@/lib/tasks/callbackToken';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { taskScope } from '@/lib/tasks/types';

type RouteParams = { cityId: string; meetingId: string; taskStatusId: string };

function scopeOf({ cityId, meetingId }: RouteParams): TaskStatusScope {
    return { cityId, councilMeetingId: meetingId };
}

function taskStatusNotFound() {
    return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
}

export async function GET(request: NextRequest, props: { params: Promise<RouteParams> }) {
    const params = await props.params;
    const taskStatus = await getTaskStatusDirect(params.taskStatusId, scopeOf(params));
    if (!taskStatus) {
        return taskStatusNotFound();
    }

    const authorized = await isUserAuthorizedToEdit(taskScope(taskStatus));
    if (!authorized) {
        // Task bodies can contain sensitive payloads. Public callers
        // (e.g. decision polling on subject pages) only need progress fields.
        const { id, type, status, stage, percentComplete, createdAt, updatedAt } = taskStatus;
        return NextResponse.json({ id, type, status, stage, percentComplete, createdAt, updatedAt });
    }

    return NextResponse.json(taskStatus);
}

export async function POST(request: NextRequest, props: { params: Promise<RouteParams> }) {
    const params = await props.params;
    return handleUpdateRequest(request, params.taskStatusId, scopeOf(params));
}

export async function PUT(request: NextRequest, props: { params: Promise<RouteParams> }) {
    const params = await props.params;
    return handleUpdateRequest(request, params.taskStatusId, scopeOf(params));
}

export async function DELETE(request: NextRequest, props: { params: Promise<RouteParams> }) {
    const params = await props.params;
    const scope = scopeOf(params);
    const taskStatus = await getTaskStatusDirect(params.taskStatusId, scope);

    if (!taskStatus) {
        return taskStatusNotFound();
    }

    const authorized = await isUserAuthorizedToEdit(taskScope(taskStatus));
    if (!authorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (taskStatus.updatedAt > tenMinutesAgo) {
        return NextResponse.json({ error: 'Cannot delete task that has been updated within the last 10 minutes' }, { status: 403 });
    }

    // A callback can update the task after the check above, so the delete repeats it.
    if (await deleteTaskStatusDirect(params.taskStatusId, scope, tenMinutesAgo) === 0) {
        return NextResponse.json({ error: 'Task status changed during the delete. Reload and try again.' }, { status: 409 });
    }

    revalidateTag(`city:${taskStatus.cityId}:meeting:${taskStatus.councilMeetingId}:derived`, 'max');

    return NextResponse.json({ message: 'Task status deleted successfully' });
}

/**
 * Whether the task was started with force. requestTranscribeInternal stores
 * the flag in the request body, and the result handler deletes the old
 * transcript only when it reads it back here, once the new one has arrived.
 */
function wasForced(requestBody: string): boolean {
    try {
        return JSON.parse(requestBody)?.force === true;
    } catch {
        return false;
    }
}

async function handleUpdateRequest(
    request: NextRequest,
    taskStatusId: string,
    scope: TaskStatusScope
) {
    // The task server is the only caller of this path, and startTask always
    // hands it a tokenized URL. Accepting an untokenized callback would leave
    // a forger the option of simply omitting the token.
    const token = request.nextUrl.searchParams.get('token');
    if (!token || !verifyCallbackToken(taskStatusId, token)) {
        console.warn(`Rejected task callback for ${taskStatusId}: ${token ? 'invalid' : 'missing'} token`);
        return NextResponse.json({ error: 'Invalid callback token' }, { status: 401 });
    }

    // The token is keyed on the task id alone, so the path tenant is still checked
    // here: a valid token replayed against another city/meeting resolves to null.
    const taskStatus = await getTaskStatusDirect(taskStatusId, scope);

    if (!taskStatus) {
        return taskStatusNotFound();
    }

    const update: TaskUpdate<any> = await request.json();

    try {
        const handler = taskHandlers[taskStatus.type];
        if (!handler) {
            throw new Error(`Unsupported task type: ${taskStatus.type}`);
        }

        await handleTaskUpdate(taskStatusId, update, handler, { force: wasForced(taskStatus.requestBody) });

        return NextResponse.json({ message: 'Task status updated successfully' });
    } catch (error) {
        console.error('Error updating task status:', error);
        return NextResponse.json({ error: 'Failed to update task status' }, { status: 500 });
    }
}
