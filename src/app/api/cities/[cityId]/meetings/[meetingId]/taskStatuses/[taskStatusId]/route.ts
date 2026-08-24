import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { handleTaskUpdate } from '@/lib/tasks/tasks';
import { taskHandlers } from '@/lib/tasks/registry';
import { TaskUpdate } from '@/lib/apiTypes';
import { deleteTaskStatus } from '@/lib/db/tasks';
import { getTaskStatusDirect } from '@/lib/db/tasksInternal';
import { verifyCallbackToken } from '@/lib/tasks/callbackToken';
import { isUserAuthorizedToEdit } from '@/lib/auth';

export async function GET(request: NextRequest, props: { params: Promise<{ taskStatusId: string }> }) {
    const params = await props.params;
    const taskStatus = await getTaskStatusDirect(params.taskStatusId);
    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    const authorized = await isUserAuthorizedToEdit({ cityId: taskStatus.cityId });
    if (!authorized) {
        // Task bodies can contain sensitive payloads. Public callers
        // (e.g. decision polling on subject pages) only need progress fields.
        const { id, type, status, stage, percentComplete, createdAt, updatedAt } = taskStatus;
        return NextResponse.json({ id, type, status, stage, percentComplete, createdAt, updatedAt });
    }

    return NextResponse.json(taskStatus);
}

export async function POST(request: NextRequest, props: { params: Promise<{ taskStatusId: string }> }) {
    const params = await props.params;
    return handleUpdateRequest(request, params.taskStatusId);
}

export async function PUT(request: NextRequest, props: { params: Promise<{ taskStatusId: string }> }) {
    const params = await props.params;
    return handleUpdateRequest(request, params.taskStatusId);
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ taskStatusId: string }> }) {
    const params = await props.params;
    const taskStatus = await getTaskStatusDirect(params.taskStatusId);

    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    const authorized = await isUserAuthorizedToEdit({ cityId: taskStatus.cityId });
    if (!authorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (taskStatus.updatedAt > tenMinutesAgo) {
        return NextResponse.json({ error: 'Cannot delete task that has been updated within the last 10 minutes' }, { status: 403 });
    }

    await deleteTaskStatus(params.taskStatusId);

    revalidateTag(`city:${taskStatus.cityId}:meeting:${taskStatus.councilMeetingId}:derived`, 'max');

    return NextResponse.json({ message: 'Task status deleted successfully' });
}

async function handleUpdateRequest(request: NextRequest, taskStatusId: string) {
    // The task server is the only caller of this path, and startTask always
    // hands it a tokenized URL. Accepting an untokenized callback would leave
    // a forger the option of simply omitting the token.
    const token = request.nextUrl.searchParams.get('token');
    if (!token || !verifyCallbackToken(taskStatusId, token)) {
        console.warn(`Rejected task callback for ${taskStatusId}: ${token ? 'invalid' : 'missing'} token`);
        return NextResponse.json({ error: 'Invalid callback token' }, { status: 401 });
    }

    const taskStatus = await getTaskStatusDirect(taskStatusId);

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
