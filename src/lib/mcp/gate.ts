import prisma from '@/lib/db/prisma';
import { NotFoundError } from '@/lib/api/errors';
import { isSuperIdentity, type McpIdentity } from './auth';

/**
 * Visibility gate for the MCP server. The underlying db functions
 * (getSubject, getSubjectsForMeeting, getTranscript, ...) do NOT check
 * `released`, and the session-aware ones (getCouncilMeeting) consult
 * next-auth, which is meaningless here — so every MCP tool that touches
 * meeting-scoped data must pass through this gate first.
 *
 * Unreleased meetings 404 for anonymous and user identities; service
 * identities (superadmin bot) see everything.
 */
export async function requireVisibleMeeting(
    cityId: string,
    meetingId: string,
    identity: McpIdentity
): Promise<{ released: boolean }> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { released: true },
    });

    if (!meeting || (!meeting.released && !isSuperIdentity(identity))) {
        throw new NotFoundError('Meeting not found');
    }

    return meeting;
}
