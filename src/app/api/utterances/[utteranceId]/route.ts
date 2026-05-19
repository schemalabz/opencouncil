import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db/prisma';

const SURROUNDING_COUNT = 15;

const publicUtteranceSelect = {
    id: true,
    text: true,
    startTimestamp: true,
    endTimestamp: true,
    drift: true,
    uncertain: true,
    lastModifiedBy: true,
    discussionStatus: true,
    discussionSubjectId: true,
    speakerSegmentId: true,
    speakerSegment: {
        select: {
            id: true,
            startTimestamp: true,
            endTimestamp: true,
            meetingId: true,
            cityId: true,
            speakerTag: {
                select: {
                    id: true,
                    label: true,
                    personId: true,
                },
            },
        },
    },
} satisfies Prisma.UtteranceSelect;

export async function GET(
    _request: NextRequest,
    { params }: { params: { utteranceId: string } }
) {
    const { utteranceId } = params;

    const utterance = await prisma.utterance.findUnique({
        where: { id: utteranceId },
        select: publicUtteranceSelect,
    });

    if (!utterance) {
        return NextResponse.json(
            { error: 'Utterance not found' },
            { status: 404 }
        );
    }

    const { meetingId, cityId } = utterance.speakerSegment;

    const [before, after] = await Promise.all([
        prisma.utterance.findMany({
            where: {
                speakerSegment: { meetingId, cityId },
                startTimestamp: { lt: utterance.startTimestamp },
            },
            orderBy: { startTimestamp: 'desc' },
            take: SURROUNDING_COUNT,
            select: publicUtteranceSelect,
        }),
        prisma.utterance.findMany({
            where: {
                speakerSegment: { meetingId, cityId },
                startTimestamp: { gt: utterance.startTimestamp },
            },
            orderBy: { startTimestamp: 'asc' },
            take: SURROUNDING_COUNT,
            select: publicUtteranceSelect,
        }),
    ]);

    return NextResponse.json({
        utterance,
        before: before.reverse(),
        after,
        meetingId,
        cityId,
    });
}
