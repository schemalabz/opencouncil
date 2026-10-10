import prisma from '@/lib/db/prisma';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { canUserEditCity, getUserCityRights } from '@/lib/db/highlights-core';
import { isSuperIdentity, type McpIdentity } from './auth';
import { currentRealm } from './realm-context';
import { meetingLabelInCity } from '@/lib/meetingName';
import { transcriptGateSelect, transcriptIsPublic } from '@/lib/db/sharing/publicContent';

/**
 * Whether the identity may see every unreleased (draft) meeting of a city:
 * service keys always, personal tokens when their user can edit the city —
 * the same people who see all the drafts of a city on the site. A body admin
 * does not pass this one; see canSeeUnreleasedMeeting.
 */
export async function canSeeUnreleased(identity: McpIdentity, cityId: string): Promise<boolean> {
    if (isSuperIdentity(identity)) return true;
    if (identity?.type === 'user') return canUserEditCity(identity.userId, cityId);
    return false;
}

/**
 * Whether the identity may see one unreleased meeting: everyone who passes
 * canSeeUnreleased, and an admin of the body that holds the meeting (#828).
 * The gate already read the meeting, so the body comes from the caller.
 */
async function canSeeUnreleasedMeeting(
    identity: McpIdentity,
    cityId: string,
    administrativeBodyId: string | null
): Promise<boolean> {
    if (isSuperIdentity(identity)) return true;
    if (identity?.type !== 'user') return false;
    const rights = await getUserCityRights(identity.userId);
    if (rights.all || rights.cityIds.has(cityId)) return true;
    return administrativeBodyId !== null && rights.bodies.get(administrativeBodyId) === cityId;
}

/**
 * Visibility gate for the MCP server. The underlying db functions
 * (getSubject, getSubjectsForMeeting, getTranscript, ...) do NOT check
 * `released`, and the session-aware ones (getCouncilMeeting) consult
 * next-auth, which is meaningless here — so every MCP tool that touches
 * meeting-scoped data must pass through this gate first.
 *
 * Unreleased meetings 404 unless the identity can see that draft (see
 * canSeeUnreleasedMeeting) — mirroring the site's visibility rules.
 */
export async function requireVisibleMeeting(
    cityId: string,
    meetingId: string,
    identity: McpIdentity
): Promise<{
    released: boolean;
    dateTime: Date;
    name: string;
    videoUrl: string | null;
    administrativeBody: { name: string } | null;
    administrativeBodyId: string | null;
    /** Readers may read the transcript (see transcriptIsPublic). */
    publicTranscript: boolean;
    /**
     * Whether the identity edits the meeting, when the gate had to find out.
     * A released meeting needs no answer, and a caller that needs one then
     * asks canSeeUnreleased itself; null says so.
     */
    editor: boolean | null;
}> {
    const meeting = await prisma.councilMeeting.findFirst({
        // Realm-scoped: a connector added on one domain must not reach another
        // realm's councils. Covers meetings, subjects and transcripts, which
        // all pass through here.
        where: { cityId, id: meetingId, city: { realm: currentRealm() } },
        // name + administrativeBody ride along so subject-scoped tools can
        // state which body met, and when, without a second lookup. videoUrl
        // rides along for the same reason: creating a highlight with a render
        // in one call has to know whether there is anything to render from.
        select: {
            released: true,
            dateTime: true,
            name: true,
            name_en: true,
            kind: true,
            sessionNumber: true,
            videoUrl: true,
            administrativeBody: { select: { name: true, name_en: true, showUnreviewedTranscript: true, type: true } },
            administrativeBodyId: true,
            taskStatuses: transcriptGateSelect.taskStatuses,
            city: { select: { timezone: true } },
        },
    });

    if (!meeting) throw new NotFoundError('Meeting not found');

    const editor = meeting.released ? null : await canSeeUnreleasedMeeting(identity, cityId, meeting.administrativeBodyId);
    if (editor === false) throw new NotFoundError('Meeting not found');

    return {
        released: meeting.released,
        dateTime: meeting.dateTime,
        name: meetingLabelInCity(meeting, 'el'),
        videoUrl: meeting.videoUrl,
        administrativeBody: meeting.administrativeBody && { name: meeting.administrativeBody.name },
        administrativeBodyId: meeting.administrativeBodyId,
        publicTranscript: transcriptIsPublic(meeting),
        editor,
    };
}

/**
 * Readers get the transcript that the site shows them (transcriptIsPublic):
 * none before the human review where the body hides unreviewed transcripts.
 * An editor of the city still reads it.
 */
export async function requirePublicTranscript(
    meeting: { publicTranscript: boolean },
    cityId: string,
    identity: McpIdentity,
): Promise<void> {
    if (meeting.publicTranscript || await canSeeUnreleased(identity, cityId)) return;
    throw new ForbiddenError('This meeting has no public transcript: its transcript awaits review.');
}
