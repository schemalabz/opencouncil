"use server";

import prisma from '@/lib/db/prisma';
import { GenerateHighlightRequest, GenerateHighlightResult } from '@/lib/apiTypes';
import { canViewHighlight } from '@/lib/db/highlights';
import { sendHighlightCompleteEmail } from '@/lib/email/highlightComplete';
import { requestGenerateHighlightCore, type GenerateHighlightOptions } from './generateHighlight-core';

export async function requestGenerateHighlight(highlightId: string, options?: GenerateHighlightOptions) {
    const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        select: { cityId: true, createdById: true },
    });

    if (!highlight) {
        throw new Error('Highlight not found');
    }

    const authorized = await canViewHighlight({
        cityId: highlight.cityId,
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
            status: true,
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

    // Determine status based on task result
    const status: 'success' | 'failure' = task.status === 'succeeded' && result.parts && result.parts.length > 0 
        ? 'success' 
        : 'failure';

    // Get createdById - either from update (success) or findUnique (failure)
    let createdById: string | null = null;

    if (status === 'success' && result.parts && result.parts.length > 0) {
        const part = result.parts[0];
        
        // Update highlight and get createdById in a single query
        const highlight = await prisma.highlight.update({
            where: { id: part.id },
            data: {
                videoUrl: part.url,
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
} 