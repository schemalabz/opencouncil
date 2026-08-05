import prisma from '@/lib/db/prisma';
import { NotFoundError } from '@/lib/api/errors';
import { canUserEditCity } from '@/lib/db/highlights-core';
import { isSuperIdentity, type McpIdentity } from './auth';
import { currentRealm } from './realm-context';

/**
 * Whether the identity may see a city's unreleased (draft) meetings: service
 * keys always, personal tokens when their user can edit the city — the same
 * people who see drafts on the site.
 */
export async function canSeeUnreleased(identity: McpIdentity, cityId: string): Promise<boolean> {
    if (isSuperIdentity(identity)) return true;
    if (identity?.type === 'user') return canUserEditCity(identity.userId, cityId);
    return false;
}

/**
 * Visibility gate for the MCP server. The underlying db functions
 * (getSubject, getSubjectsForMeeting, getTranscript, ...) do NOT check
 * `released`, and the session-aware ones (getCouncilMeeting) consult
 * next-auth, which is meaningless here — so every MCP tool that touches
 * meeting-scoped data must pass through this gate first.
 *
 * Unreleased meetings 404 unless the identity can see drafts for the city
 * (see canSeeUnreleased) — mirroring the site's visibility rules.
 */
export async function requireVisibleMeeting(
    cityId: string,
    meetingId: string,
    identity: McpIdentity
): Promise<{ released: boolean }> {
    const meeting = await prisma.councilMeeting.findFirst({
        // Realm-scoped: a connector added on one domain must not reach another
        // realm's councils. Covers meetings, subjects and transcripts, which
        // all pass through here.
        where: { cityId, id: meetingId, city: { realm: currentRealm() } },
        select: { released: true },
    });

    if (!meeting || (!meeting.released && !(await canSeeUnreleased(identity, cityId)))) {
        throw new NotFoundError('Meeting not found');
    }

    return meeting;
}
