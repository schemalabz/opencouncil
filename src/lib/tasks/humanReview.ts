"use server";

import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { revalidateTag } from 'next/cache';
import { getMeetingReviewStats } from '@/lib/db/reviews';
import { sendHumanReviewCompletedAdminAlert } from '@/lib/discord';
import { sendTranscriptToMunicipality } from './sendTranscript';

/**
 * Get the contact emails for a meeting's administrative body
 * Returns empty array if no contact emails are configured
 */
export async function getMeetingContactEmails(cityId: string, meetingId: string): Promise<{
    contactEmails: string[];
    administrativeBodyName: string | null;
}> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        include: {
            administrativeBody: {
                select: {
                    contactEmails: true,
                    name: true,
                }
            }
        }
    });

    return {
        contactEmails: meeting?.administrativeBody?.contactEmails || [],
        administrativeBodyName: meeting?.administrativeBody?.name || null,
    };
}

/**
 * Mark human review as complete for a meeting
 * This creates a virtual task that represents human review completion
 *
 * @param manualReviewTime - Optional manual time estimate provided by reviewer if calculated time is inaccurate
 * @param sendTranscript - Whether to send the transcript email to the municipality (default: false; callers must opt in)
 */
export async function markHumanReviewComplete(
    cityId: string,
    meetingId: string,
    manualReviewTime?: string,
    sendTranscript: boolean = false
) {
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

    // Get actual reviewer stats from the meeting's edit history
    // This identifies the primary reviewer (most edits) regardless of who clicks "complete"
    const stats = await getMeetingReviewStats({ cityId, meetingId });

    // Get meeting details for Discord alert
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        include: {
            city: true
        }
    });
    
    const created = await prisma.taskStatus.create({
        data: {
            type: 'humanReview',
            status: 'succeeded',
            requestBody: JSON.stringify({ 
                triggeredBy: 'user',
                ...(manualReviewTime && { manualReviewTime })
            }),
            councilMeeting: { connect: { cityId_id: { cityId, id: meetingId } } }
        }
    });

    // Send Discord admin alert with review stats
    // Show primary reviewer and list any secondary reviewers for context
    if (stats.hasReviewers && stats.primaryReviewer && meeting) {
        // Extract session data from unified review sessions
        const sessionDurations = stats.unifiedReviewSessions?.map(s => s.durationMs) || [];
        const sessionReviewerIds = stats.unifiedReviewSessions?.map(s => s.reviewerId) || [];
        
        // Calculate total review time from all sessions (all reviewers)
        const totalReviewTimeMs = sessionDurations.reduce((sum, duration) => sum + duration, 0);
        
        // Calculate efficiency based on total time from all reviewers
        const totalReviewEfficiency = stats.meetingDurationMs > 0 && totalReviewTimeMs > 0
            ? totalReviewTimeMs / stats.meetingDurationMs
            : stats.reviewEfficiency;
        
        sendHumanReviewCompletedAdminAlert({
            cityId,
            cityName: meeting.city.name_en,
            meetingId,
            meetingName: meeting.name,
            primaryReviewer: stats.primaryReviewer,
            secondaryReviewers: stats.secondaryReviewers,
            editCount: stats.editCount,
            totalUtterances: stats.totalUtterances,
            estimatedReviewTimeMs: stats.estimatedReviewTimeMs,
            totalReviewTimeMs,
            sessionDurations,
            sessionReviewerIds,
            meetingDurationMs: stats.meetingDurationMs,
            reviewEfficiency: totalReviewEfficiency,
            manualReviewTime,
        });
    }
    
    // Revalidate tags that list meetings for the city
    try {
        revalidateTag(`city:${cityId}:meetings`);
    } catch (error) {
        // Log cache revalidation errors but don't fail the operation
        // Cache revalidation is not critical for the core functionality
        console.error(`Failed to revalidate cache for city ${cityId}:`, error);
    }

    // Send transcript to municipality (fire-and-forget, non-blocking)
    // This sends the transcript email with DOCX attachment if contactEmails are configured
    // Only send if the reviewer opted to send the transcript
    if (sendTranscript) {
        sendTranscriptToMunicipality(cityId, meetingId)
            .then(result => {
                if (result.success && !result.skipped) {
                    console.log(`[humanReview] Transcript sent to ${result.recipientEmails?.join(', ')} for ${cityId}/${meetingId}`);
                } else if (result.skipped) {
                    console.log(`[humanReview] Transcript sending skipped (no contact emails) for ${cityId}/${meetingId}`);
                }
            })
            .catch(error => {
                // Errors are already logged in sendTranscriptToMunicipality
                console.error(`[humanReview] Error sending transcript for ${cityId}/${meetingId}:`, error);
            });
    } else {
        console.log(`[humanReview] Transcript sending disabled by reviewer for ${cityId}/${meetingId}`);
    }

    return created;
}
