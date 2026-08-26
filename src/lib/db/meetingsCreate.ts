// Server-only (NOT a "use server" action). createCouncilMeetingDirect skips the
// auth check on purpose — its sole caller, the meetings API route, authorizes
// first via withServiceOrUserAuth, which also admits service keys, so a
// user-session gate cannot live inside the function. Keeping it off the Server
// Action surface is what prevents a client from POSTing it directly to create
// meetings with no authorization. The gated wrapper is createCouncilMeeting in
// meetings.ts.
import "server-only";
import type { CouncilMeeting } from '@prisma/client';
import prisma from "./prisma";
import type { CouncilMeetingWithAdminBody } from "./meetings";

/**
 * Create a council meeting without auth checks.
 * Use when authorization has already been verified by the caller
 * (e.g., via withServiceOrUserAuth in API route handlers).
 */
export async function createCouncilMeetingDirect(
    meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl' | 'calendarEventId'> & { audioUrl?: string; videoUrl?: string },
): Promise<CouncilMeetingWithAdminBody> {
    return prisma.councilMeeting.create({
        data: meetingData,
        include: { administrativeBody: true },
    });
}
