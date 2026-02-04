import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { handleTaskUpdate } from '@/lib/tasks/tasks';
import { taskHandlers } from '@/lib/tasks/registry';
import { TaskUpdate } from '@/lib/apiTypes';
import { deleteTaskStatus, getTaskStatus } from '@/lib/db/tasks';

export async function GET(
    request: NextRequest,
    { params }: { params: { taskStatusId: string } }
) {
    const taskStatus = await getTaskStatus(params.taskStatusId);
    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    return NextResponse.json(taskStatus);
}

export async function POST(
    request: NextRequest,
    { params }: { params: { taskStatusId: string } }
) {
    return handleUpdateRequest(request, params.taskStatusId);
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { taskStatusId: string } }
) {
    return handleUpdateRequest(request, params.taskStatusId);
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { taskStatusId: string } }
) {
    const taskStatus = await getTaskStatus(params.taskStatusId);

    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (taskStatus.updatedAt > tenMinutesAgo) {
        return NextResponse.json({ error: 'Cannot delete task that has been updated within the last 10 minutes' }, { status: 403 });
    }

    await deleteTaskStatus(params.taskStatusId);

    revalidateTag(`city:${taskStatus.cityId}:meeting:${taskStatus.councilMeetingId}:derived`);

    return NextResponse.json({ message: 'Task status deleted successfully' });
}

async function handleUpdateRequest(request: NextRequest, taskStatusId: string) {
    const taskStatus = await getTaskStatus(taskStatusId);

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
