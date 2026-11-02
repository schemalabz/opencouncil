import prisma from '@/lib/db/prisma';
import { ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { canUserEditCity } from '@/lib/db/highlights-core';
import { resolve } from '@/lib/auth/rights';
import { loadActor, realmFor } from '@/lib/auth/grants.server';
import type { McpIdentity } from './auth';
import { currentRealm, reachesEveryRealm, rememberCityRealm } from './realm-context';
import { meetingLabelInCity } from '@/lib/meetingName';
import { REALMS } from '@/lib/realm';
import type { AppLocale } from '@/i18n/config';
import { transcriptGateSelect, transcriptIsPublic } from '@/lib/db/sharing/publicContent';

/**
 * Whether the identity may see every unreleased (draft) meeting of a city:
 * the `drafts.read` right on the city — the same people who see all the
 * drafts of a city on the site. A body grant does not pass this one; see
 * canSeeUnreleasedMeeting.
 */
export async function canSeeUnreleased(identity: McpIdentity, cityId: string): Promise<boolean> {
    if (!identity) return false;
    return canUserEditCity(identity.userId, cityId, 'drafts.read');
}

/**
 * Whether the identity may see one unreleased meeting: everyone who passes
 * canSeeUnreleased, and a grant on the body that holds the meeting (#828).
 * The gate already read the meeting, so the body comes from the caller.
 */
async function canSeeUnreleasedMeeting(
    identity: McpIdentity,
    cityId: string,
    administrativeBodyId: string | null
): Promise<boolean> {
    if (!identity) return false;
    const actor = await loadActor(identity.userId);
    if (!actor) return false;
    const realm = await realmFor(actor, cityId);
    return resolve(actor, 'drafts.read', administrativeBodyId
        ? { level: 'body', realm, cityId, bodyId: administrativeBodyId }
        : { level: 'city', realm, cityId });
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
    /**
     * The UI language of the city's realm. The site shows the city in this
     * language, so a tool names the meeting and the roles in it too.
     */
    locale: AppLocale;
    contentLanguage: string;
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
        // all pass through here. A superadmin reaches every realm.
        where: { cityId, id: meetingId, ...(!reachesEveryRealm() && { city: { realm: currentRealm() } }) },
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
            urgent: true,
            videoUrl: true,
            administrativeBody: { select: { name: true, name_en: true, showUnreviewedTranscript: true } },
            administrativeBodyId: true,
            taskStatuses: transcriptGateSelect.taskStatuses,
            city: { select: { timezone: true, realm: true, language: true } },
        },
    });

    if (!meeting) throw new NotFoundError('Meeting not found');
    rememberCityRealm(cityId, meeting.city.realm);

    const editor = meeting.released ? null : await canSeeUnreleasedMeeting(identity, cityId, meeting.administrativeBodyId);
    if (editor === false) throw new NotFoundError('Meeting not found');
    const locale = REALMS[meeting.city.realm].defaultLocale;

    return {
        released: meeting.released,
        dateTime: meeting.dateTime,
        name: meetingLabelInCity(meeting, locale),
        locale,
        contentLanguage: meeting.city.language,
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
 * An editor of the meeting still reads it.
 */
export async function requirePublicTranscript(
    meeting: { publicTranscript: boolean; administrativeBodyId: string | null },
    cityId: string,
    identity: McpIdentity,
): Promise<void> {
    if (meeting.publicTranscript || await canSeeUnreleasedMeeting(identity, cityId, meeting.administrativeBodyId)) return;
    throw new ForbiddenError('This meeting has no public transcript: its transcript awaits review.');
}
