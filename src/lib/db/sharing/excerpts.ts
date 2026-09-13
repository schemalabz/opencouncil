import 'server-only';
import { createHash } from 'crypto';
import type { Prisma, Realm } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { localizeText } from '@/lib/serbian';
import { getLocalizedName } from '@/lib/formatters/name';
import { getPublicMeeting, transcriptIsPublic, type PublicMeeting } from './publicContent';
import { canonicalExcerpt, MAX_EXCERPT_UTTERANCES, selectExcerptRuns, type ExcerptRun, type ExcerptSelector } from '@/lib/sharing/excerptSelector';

const subjectSelect = { id: true, name: true, topic: { select: { name: true, name_en: true, colorHex: true, icon: true } } } satisfies Prisma.SubjectSelect;
type SubjectRow = Prisma.SubjectGetPayload<{ select: typeof subjectSelect }>;

/**
 * How far, in seconds, a passage looks for an assigned utterance to borrow a
 * subject from. Asides inside a discussion sit seconds from it; the opening
 * of a meeting sits minutes before its first subject.
 */
const NEAREST_SUBJECT_WINDOW_S = 120;

const utteranceSelect = {
    id: true, text: true, startTimestamp: true, speakerSegmentId: true, discussionStatus: true,
    discussionSubject: { select: subjectSelect },
    speakerSegment: { select: {
        id: true, startTimestamp: true,
        speakerTag: { select: { id: true, personId: true, person: { select: { name: true, name_en: true } } } },
    } },
} satisfies Prisma.UtteranceSelect;
type Source = Prisma.UtteranceGetPayload<{ select: typeof utteranceSelect }>;
export interface PublicExcerpt {
    meeting: PublicMeeting;
    isReviewed: boolean;
    selector: ExcerptSelector;
    runs: ExcerptRun[];
    /** The subject the passage belongs to, for its title and its picture; null when the meeting gives no clue. */
    subject: SubjectRow | null;
    before: string;
    after: string;
    startTimestamp: number;
}
export type ExcerptResult = { status: 'ok'; excerpt: PublicExcerpt } | { status: 'invalid' | 'source-changed' | 'unavailable' };

function boundary(source: Source, direction: 'gte' | 'lte'): Prisma.UtteranceWhereInput {
    const strict = direction === 'gte' ? 'gt' : 'lt';
    return { OR: [
        { speakerSegment: { startTimestamp: { [strict]: source.speakerSegment.startTimestamp } } },
        { speakerSegment: { startTimestamp: source.speakerSegment.startTimestamp, id: { [strict]: source.speakerSegmentId } } },
        { speakerSegmentId: source.speakerSegmentId, startTimestamp: { [strict]: source.startTimestamp } },
        { speakerSegmentId: source.speakerSegmentId, startTimestamp: source.startTimestamp, id: { [direction]: source.id } },
    ] };
}

/**
 * The subject a passage belongs to.
 *
 * The summarize task assigns a subject to each utterance it places inside a
 * subject's discussion and leaves the rest unassigned: the roll call, procedure,
 * an aside. A passage can hold both kinds, so it takes the subject most of its
 * utterances carry. A roll call belongs to no subject. Any other passage with
 * none takes the nearest assigned utterance of the meeting, within the window,
 * since a remark seconds from a discussion is about that discussion. A meeting
 * with one subject names it.
 */
async function resolveSubject(sources: Source[], scope: Prisma.UtteranceWhereInput, first: Source, last: Source, meeting: PublicMeeting): Promise<SubjectRow | null> {
    const counts = new Map<string, { subject: SubjectRow; count: number }>();
    for (const { discussionSubject } of sources) {
        if (!discussionSubject) continue;
        const entry = counts.get(discussionSubject.id) ?? { subject: discussionSubject, count: 0 };
        entry.count += 1;
        counts.set(discussionSubject.id, entry);
    }
    const majority = [...counts.values()].sort((a, b) => b.count - a.count)[0]?.subject;
    if (majority) return majority;
    if (sources.every(source => source.discussionStatus === 'ATTENDANCE')) return null;

    const assigned = { ...scope, discussionSubjectId: { not: null } };
    const select = { startTimestamp: true, discussionSubject: { select: subjectSelect } };
    const [before, after] = await Promise.all([
        prisma.utterance.findFirst({ where: { ...assigned, startTimestamp: { lt: first.startTimestamp } }, orderBy: [{ startTimestamp: 'desc' }, { id: 'desc' }], select }),
        prisma.utterance.findFirst({ where: { ...assigned, startTimestamp: { gt: last.startTimestamp } }, orderBy: [{ startTimestamp: 'asc' }, { id: 'asc' }], select }),
    ]);
    const nearby: { subject: SubjectRow; distance: number }[] = [];
    if (before?.discussionSubject) nearby.push({ subject: before.discussionSubject, distance: first.startTimestamp - before.startTimestamp });
    if (after?.discussionSubject) nearby.push({ subject: after.discussionSubject, distance: after.startTimestamp - last.startTimestamp });
    const nearest = nearby.filter(entry => entry.distance <= NEAREST_SUBJECT_WINDOW_S).sort((a, b) => a.distance - b.distance)[0]?.subject;
    if (nearest) return nearest;

    const subjects = await prisma.subject.findMany({ where: { cityId: meeting.cityId, councilMeetingId: meeting.id }, select: subjectSelect, take: 2 });
    return subjects.length === 1 ? subjects[0] : null;
}

export async function getPublicExcerpt(selector: ExcerptSelector, realm: Realm): Promise<ExcerptResult> {
    const meeting = await getPublicMeeting(selector.cityId, selector.meetingId, realm);
    if (!meeting || !transcriptIsPublic(meeting)) return { status: 'unavailable' };
    const driftFilter = selector.maxDrift === undefined ? {} : { drift: { lte: selector.maxDrift } };
    const scope = { speakerSegment: { cityId: selector.cityId, meetingId: selector.meetingId }, ...driftFilter };
    const endpoints = await prisma.utterance.findMany({
        where: { ...scope, id: { in: [selector.firstUtteranceId, selector.lastUtteranceId] } },
        select: utteranceSelect, take: 2,
    });
    const first = endpoints.find(row => row.id === selector.firstUtteranceId);
    const last = endpoints.find(row => row.id === selector.lastUtteranceId);
    if (!first || !last) return { status: 'source-changed' };
    const sources = await prisma.utterance.findMany({
        where: { AND: [scope, boundary(first, 'gte'), boundary(last, 'lte')] },
        orderBy: [{ speakerSegment: { startTimestamp: 'asc' } }, { speakerSegment: { id: 'asc' } }, { startTimestamp: 'asc' }, { id: 'asc' }],
        select: utteranceSelect, take: MAX_EXCERPT_UTTERANCES + 1,
    });
    if (sources[0]?.id !== first.id || sources[sources.length - 1]?.id !== last.id) return { status: 'invalid' };
    const runs = selectExcerptRuns(sources.map(source => {
        const tag = source.speakerSegment.speakerTag;
        return { id: source.id, text: localizeText(source.text, selector.textLocale), speakerTagId: tag.id, personId: tag.personId, speakerName: tag.person ? getLocalizedName(tag.person, selector.textLocale) : null };
    }));
    if (!runs) return { status: 'invalid' };
    if (createHash('sha256').update(canonicalExcerpt(runs)).digest('hex') !== selector.digest) return { status: 'source-changed' };
    // Stay within each endpoint's speaker segment so context has honest attribution.
    const [previous, next] = await Promise.all([
        prisma.utterance.findFirst({
            where: { ...driftFilter, speakerSegmentId: first.speakerSegmentId, OR: [{ startTimestamp: { lt: first.startTimestamp } }, { startTimestamp: first.startTimestamp, id: { lt: first.id } }] },
            orderBy: [{ startTimestamp: 'desc' }, { id: 'desc' }], select: { text: true },
        }),
        prisma.utterance.findFirst({
            where: { ...driftFilter, speakerSegmentId: last.speakerSegmentId, OR: [{ startTimestamp: { gt: last.startTimestamp } }, { startTimestamp: last.startTimestamp, id: { gt: last.id } }] },
            orderBy: [{ startTimestamp: 'asc' }, { id: 'asc' }], select: { text: true },
        }),
    ]);
    const before = previous ? localizeText(previous.text, selector.textLocale).slice(-120) : '';
    const after = next ? localizeText(next.text, selector.textLocale).slice(0, 120) : '';
    const subject = await resolveSubject(sources, scope, first, last, meeting);
    return { status: 'ok', excerpt: {
        meeting, isReviewed: meeting.taskStatuses.length > 0, selector, runs,
        subject: subject && { ...subject, name: localizeText(subject.name, selector.textLocale) },
        startTimestamp: first.startTimestamp,
        before, after,
    } };
}
