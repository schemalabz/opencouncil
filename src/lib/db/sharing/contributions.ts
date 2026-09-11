import 'server-only';
import type { Prisma, Realm } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';
import { getLocalizedName } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';
import { extractUtteranceIds } from '@/lib/utils/references';
import { publicSubjectSelect, transcriptIsPublic } from './publicContent';
import { localePath, validSourceId } from '@/lib/sharing/excerptSelector';
import { contributionSubjectPath } from '@/lib/sharing/contributionUrl';

const contributionSelect = {
    id: true, text: true, speakerId: true, speakerName: true,
    speaker: { select: { name: true, name_en: true, image: true } },
    subject: { select: publicSubjectSelect },
} satisfies Prisma.SpeakerContributionSelect;
export const MAX_CONTRIBUTION_REFERENCES = 100;

export async function getPublicContribution(id: string, realm: Realm, locale: string) {
    if (!validSourceId(id)) return null;
    const contribution = await prisma.speakerContribution.findFirst({
        where: { id, subject: { councilMeeting: { released: true, city: { ...PUBLIC_CITY_WHERE, realm } } } }, select: contributionSelect,
    });
    if (!contribution) return null;
    const { subject } = contribution;
    const meeting = subject.councilMeeting;
    const transcriptUrl = localePath(locale, `/${meeting.cityId}/${meeting.id}/transcript`);
    const referenceIds = [...new Set(extractUtteranceIds(contribution.text))].filter(validSourceId).slice(0, MAX_CONTRIBUTION_REFERENCES);
    const canReadTranscript = transcriptIsPublic(meeting);
    const [references, firstUtterance] = await Promise.all([
        canReadTranscript && referenceIds.length ? prisma.utterance.findMany({
            where: { id: { in: referenceIds }, speakerSegment: { cityId: meeting.cityId, meetingId: meeting.id } },
            select: { id: true, startTimestamp: true }, take: MAX_CONTRIBUTION_REFERENCES,
        }) : [],
        canReadTranscript && contribution.speakerId ? prisma.utterance.findFirst({
            where: { discussionSubjectId: subject.id, discussionStatus: 'SUBJECT_DISCUSSION', speakerSegment: { cityId: meeting.cityId, meetingId: meeting.id, speakerTag: { personId: contribution.speakerId } } },
            orderBy: [{ startTimestamp: 'asc' }, { id: 'asc' }], select: { startTimestamp: true },
        }) : null,
    ]);
    const timestamp = firstUtterance?.startTimestamp ?? (references.length ? Math.min(...references.map(ref => ref.startTimestamp)) : null);
    return {
        id: contribution.id, text: contribution.text, subject, meeting,
        speakerName: contribution.speaker ? getLocalizedName(contribution.speaker, locale) : contribution.speakerName ? localizeText(contribution.speakerName, locale) : null,
        speakerImage: contribution.speaker?.image ?? null,
        referenceLinks: Object.fromEntries(references.map(ref => [ref.id, `${transcriptUrl}?t=${Math.floor(ref.startTimestamp)}#${ref.id}`])),
        playbackUrl: timestamp !== null ? `${transcriptUrl}?t=${Math.floor(timestamp)}` : null,
        subjectUrl: contributionSubjectPath(locale, meeting.cityId, meeting.id, subject.id, contribution.id),
    };
}
export type PublicContribution = NonNullable<Awaited<ReturnType<typeof getPublicContribution>>>;
