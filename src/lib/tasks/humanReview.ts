"use server";

import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { revalidateTag } from 'next/cache';

/**
 * Mark human review as complete for a meeting
 * This creates a virtual task that represents human review completion
 */
export async function markHumanReviewComplete(cityId: string, meetingId: string) {
    await withUserAuthorizedToEdit({ councilMeetingId: meetingId, cityId });
    
    // If one already exists, return it
    const existing = await prisma.taskStatus.findFirst({
        where: { 
            cityId, 
            councilMeetingId: meetingId, 
            type: 'humanReview', 
            status: 'succeeded' 
        },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }]
    });
    
    if (existing) {
        return existing;
    }
    
    const created = await prisma.taskStatus.create({
        data: {
            type: 'humanReview',
            status: 'succeeded',
            requestBody: JSON.stringify({ triggeredBy: 'user' }),
            councilMeeting: { connect: { cityId_id: { cityId, id: meetingId } } }
        }
    });
    
    // Revalidate tags that list meetings for the city
    try {
        revalidateTag(`city:${cityId}:meetings`);
    } catch {}
    
    return created;
}
