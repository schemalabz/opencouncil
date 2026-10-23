// Server-only, not a "use server" module (see lib/db/meetings.ts). No client
// component calls anything here: the API route authorizes before it reaches
// requestGenerateHighlight, and handleGenerateHighlightResult belongs to the
// task-server callback.
import "server-only";

import prisma from '@/lib/db/prisma';
import { GenerateHighlightRequest, GenerateHighlightResult } from '@/lib/apiTypes';
import { canViewHighlight } from '@/lib/db/highlights';
import { sendHighlightCompleteEmail } from '@/lib/email/highlightComplete';
import { webUrl } from '@/lib/zod-schemas/primitives';
import { requestGenerateHighlightCore, type GenerateHighlightOptions } from './generateHighlight-core';

export async function requestGenerateHighlight(highlightId: string, options?: GenerateHighlightOptions) {
    const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        select: { cityId: true, meetingId: true, createdById: true },
    });

    if (!highlight) {
        throw new Error('Highlight not found');
    }

    const authorized = await canViewHighlight({
        cityId: highlight.cityId,
        meetingId: highlight.meetingId,
        createdById: highlight.createdById
    });

    if (!authorized) {
        throw new Error('Not authorized to generate this highlight');
    }

    return requestGenerateHighlightCore(highlightId, options);
}

export async function handleGenerateHighlightResult(taskId: string, result: GenerateHighlightResult) {
    // Get the task status to determine success/failure
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        select: {
            requestBody: true
        }
    });

    if (!task) {
        console.error('Task not found:', taskId);
        return;
    }

    // Extract highlight ID from the request
    let highlightId: string | undefined;
    try {
        const request = JSON.parse(task.requestBody) as GenerateHighlightRequest;
        highlightId = request.parts?.[0]?.id;
    } catch (error) {
        console.error('Failed to parse task request body:', error);
        return;
    }

    if (!highlightId) {
        console.error('No highlight ID found in task request');
        return;
    }

    // The handler runs on a success callback, or on a replay of one, so the
    // result alone says whether a video came back. The task does not read as
    // succeeded while its handler runs.
    //
    // Only the request says which highlight the task rendered. The result
    // names one too, but a callback body is caller data: it must not be able
    // to point the video of another highlight at a URL of its choice, and the
    // URL it does bring must be a web URL.
    const part = result.parts?.[0];
    const renderedUrl = part && part.id === highlightId ? webUrl().safeParse(part.url) : undefined;
    const status: 'success' | 'failure' = renderedUrl?.success ? 'success' : 'failure';
    const failureReason = !part
        ? 'The result has no rendered part'
        : part.id !== highlightId
            ? `The result names highlight ${part.id}, the task rendered ${highlightId}`
            : renderedUrl?.success ? null : 'The result video URL is not a web URL';

    // Get createdById - either from update (success) or findUnique (failure)
    let createdById: string | null = null;

    if (part && renderedUrl?.success) {
        // Update highlight and get createdById in a single query
        const highlight = await prisma.highlight.update({
            where: { id: highlightId },
            data: {
                videoUrl: renderedUrl.data,
                ...(part.muxPlaybackId ? { muxPlaybackId: part.muxPlaybackId } : {}),
            },
            select: {
                createdById: true
            }
        });

        createdById = highlight.createdById;
    } else {
        // Task failed - just get createdById
        const highlight = await prisma.highlight.findUnique({
            where: { id: highlightId },
            select: {
                createdById: true
            }
        });
        
        createdById = highlight?.createdById ?? null;
    }

    // Send email notification to the creator if they exist
    if (createdById) {
        // Fire and forget - don't await to avoid blocking task completion
        sendHighlightCompleteEmail({
            userId: createdById,
            highlightId,
            status
        }).catch(error => {
            console.error('Failed to send highlight completion email:', error);
        });
    }

    // A result that wrote no video is a failed task, not a succeeded one: the
    // caller of this handler marks the task failed and alerts on a throw.
    if (failureReason !== null) {
        throw new Error(`Highlight ${highlightId}: ${failureReason}`);
    }
} 