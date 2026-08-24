// Server-only (NOT a "use server" action — see the note in meetingsCreate.ts).
// These helpers skip auth checks on purpose: their sole caller,
// syncMeetingToCalendar, runs after the triggering route has already
// authorized the write. Keeping them out of the "use server" module keeps
// them off the Server Action surface, so a client cannot invoke them
// directly to read the operator's email or rewrite calendarEventId.
import "server-only";
import type { Prisma } from '@prisma/client';
import prisma from "./prisma";

const meetingForCalendarSyncInclude = {
    city: { select: { name: true, timezone: true } },
    administrativeBody: { select: { name: true } },
    meetingOperator: { include: { user: { select: { email: true } } } },
} satisfies Prisma.CouncilMeetingInclude;

export type MeetingForCalendarSync = Prisma.CouncilMeetingGetPayload<{
    include: typeof meetingForCalendarSyncInclude
}>;

/**
 * Loads the data needed to mirror a meeting to the shared Google Calendar.
 */
export async function getMeetingForCalendarSync(cityId: string, meetingId: string): Promise<MeetingForCalendarSync | null> {
    return prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        include: meetingForCalendarSyncInclude,
    });
}

export async function setMeetingCalendarEventId(cityId: string, meetingId: string, calendarEventId: string): Promise<void> {
    await prisma.councilMeeting.update({
        where: { cityId_id: { cityId, id: meetingId } },
        data: { calendarEventId },
    });
}
