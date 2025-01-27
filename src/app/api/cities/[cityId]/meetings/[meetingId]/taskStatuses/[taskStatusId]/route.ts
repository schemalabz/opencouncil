import { NextRequest, NextResponse } from 'next/server';
import { handleTaskUpdate } from '@/lib/tasks/tasks';
import { handleTranscribeResult } from '@/lib/tasks/transcribe';
import { FixTranscriptResult, GeneratePodcastSpecResult, ProcessAgendaResult, SplitMediaFileResult, SummarizeResult, TaskUpdate, TranscribeResult } from '@/lib/apiTypes';
import { handleSummarizeResult } from '@/lib/tasks/summarize';
import { deleteTaskStatus, getTaskStatus } from '@/lib/db/tasks';
import { handleGeneratePodcastSpecResult } from '@/lib/tasks/generatePodcastSpec';
import { handleSplitMediaFileResult } from '@/lib/tasks/splitMediaFile';
import { handleFixTranscriptResult } from '@/lib/tasks/fixTranscript';
import { handleProcessAgendaResult } from '@/lib/tasks/processAgenda';

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

    return NextResponse.json({ message: 'Task status deleted successfully' });
}

async function handleUpdateRequest(request: NextRequest, taskStatusId: string) {
    const taskStatus = await getTaskStatus(taskStatusId);

    if (!taskStatus) {
        return NextResponse.json({ error: 'Task status not found' }, { status: 404 });
    }

    const update: TaskUpdate<any> = await request.json();

    try {
        if (taskStatus.type === 'transcribe') {
            await handleTaskUpdate(taskStatusId, update as TaskUpdate<TranscribeResult>, handleTranscribeResult);
        } else if (taskStatus.type === 'summarize') {
            await handleTaskUpdate(taskStatusId, update as TaskUpdate<SummarizeResult>, handleSummarizeResult);
        } else if (taskStatus.type === 'generatePodcastSpec') {
            await handleTaskUpdate(taskStatusId, update as TaskUpdate<GeneratePodcastSpecResult>, handleGeneratePodcastSpecResult);
        } else if (taskStatus.type === 'splitMediaFile') {
            await handleTaskUpdate(taskStatusId, update as TaskUpdate<SplitMediaFileResult>, handleSplitMediaFileResult);
        } else if (taskStatus.type === 'fixTranscript') {
            await handleTaskUpdate(taskStatusId, update as TaskUpdate<FixTranscriptResult>, handleFixTranscriptResult);
        } else if (taskStatus.type === 'processAgenda') {
            await handleTaskUpdate(taskStatusId, update as TaskUpdate<ProcessAgendaResult>, handleProcessAgendaResult);
        } else {
            // Handle other task types here if needed
            throw new Error(`Unsupported task type: ${taskStatus.type}`);
        }

        return NextResponse.json({ message: 'Task status updated successfully' });
    } catch (error) {
        console.error('Error updating task status:', error);
        return NextResponse.json({ error: 'Failed to update task status' }, { status: 500 });
    }
}
