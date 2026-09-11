import 'server-only';
import { createHash } from 'crypto';
import type { Prisma, Realm } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { localizeText } from '@/lib/serbian';
import { getLocalizedName } from '@/lib/formatters/name';
import { getPublicMeeting, transcriptIsPublic, type PublicMeeting } from './publicContent';
import { canonicalExcerpt, MAX_EXCERPT_UTTERANCES, selectExcerptRuns, type ExcerptRun, type ExcerptSelector } from '@/lib/sharing/excerptSelector';

const utteranceSelect = {
    id: true, text: true, startTimestamp: true, speakerSegmentId: true,
    discussionSubject: { select: { id: true, name: true } },
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
    subject: { id: string; name: string } | null;
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
    const subject = sources[0].discussionSubject;
    const singleSubject = subject && sources.every(source => source.discussionSubject?.id === subject.id) ? { id: subject.id, name: localizeText(subject.name, selector.textLocale) } : null;
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
    return { status: 'ok', excerpt: {
        meeting, isReviewed: meeting.taskStatuses.length > 0, selector, runs, subject: singleSubject, startTimestamp: first.startTimestamp,
        before, after,
    } };
}
