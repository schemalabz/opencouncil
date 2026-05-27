import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from './prisma';
import { isUserAuthorizedToEdit, validateBearerAuth } from '../auth';

const neighborSelect = {
    id: true,
    text: true,
    startTimestamp: true,
    endTimestamp: true,
    speakerSegment: { select: { speakerTagId: true } },
} satisfies Prisma.UtteranceSelect;

type NeighborRow = Prisma.UtteranceGetPayload<{ select: typeof neighborSelect }>;

export type UtteranceContextNeighbor = {
    id: string;
    text: string;
    start: number;
    end: number;
    speakerTagId: string;
};

export type UtteranceContext = {
    meeting: { id: string; cityId: string; name: string; dateTime: string };
    before: UtteranceContextNeighbor[];
    after: UtteranceContextNeighbor[];
};

const toNeighbor = (u: NeighborRow): UtteranceContextNeighbor => ({
    id: u.id,
    text: u.text,
    start: u.startTimestamp,
    end: u.endTimestamp,
    speakerTagId: u.speakerSegment.speakerTagId,
});

export async function getUtteranceContext(
    request: NextRequest,
    utteranceId: string,
    before: number,
    after: number
): Promise<UtteranceContext | null> {
    const target = await prisma.utterance.findUnique({
        where: { id: utteranceId },
        select: {
            id: true,
            startTimestamp: true,
            speakerSegment: {
                select: {
                    meetingId: true,
                    cityId: true,
                    meeting: {
                        select: { name: true, dateTime: true, released: true },
                    },
                },
            },
        },
    });

    if (!target) return null;

    const { meetingId, cityId, meeting } = target.speakerSegment;

    if (!meeting.released) {
        const bearer = await validateBearerAuth(request);
        if (!bearer && !(await isUserAuthorizedToEdit({ cityId }))) {
            return null;
        }
    }

    const segmentFilter = {
        speakerSegment: { is: { meetingId, cityId } },
    };

    const [beforeRows, afterRows] = await Promise.all<NeighborRow[]>([
        before === 0
            ? Promise.resolve([])
            : prisma.utterance.findMany({
                where: {
                    ...segmentFilter,
                    OR: [
                        { startTimestamp: { lt: target.startTimestamp } },
                        {
                            startTimestamp: target.startTimestamp,
                            id: { lt: target.id },
                        },
                    ],
                },
                orderBy: [{ startTimestamp: 'desc' }, { id: 'desc' }],
                take: before,
                select: neighborSelect,
            }),
        after === 0
            ? Promise.resolve([])
            : prisma.utterance.findMany({
                where: {
                    ...segmentFilter,
                    OR: [
                        { startTimestamp: { gt: target.startTimestamp } },
                        {
                            startTimestamp: target.startTimestamp,
                            id: { gt: target.id },
                        },
                    ],
                },
                orderBy: [{ startTimestamp: 'asc' }, { id: 'asc' }],
                take: after,
                select: neighborSelect,
            }),
    ]);

    return {
        meeting: {
            id: meetingId,
            cityId,
            name: meeting.name,
            dateTime: meeting.dateTime.toISOString(),
        },
        before: beforeRows.slice().reverse().map(toNeighbor),
        after: afterRows.map(toNeighbor),
    };
}
