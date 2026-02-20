import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';

/**
 * Returns the time range for a speaker's discussion of a specific subject.
 * Returns startTimestamp (earliest) and endTimestamp (latest) across all utterances.
 * Uses the discussionSubjectId index for efficient lookup.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ subjectId: string; speakerId: string }> }
) {
    try {
        const { subjectId, speakerId } = await params;

        // Find all utterances where:
        // - discussionSubjectId matches the subject (uses index)
        // - discussionStatus is SUBJECT_DISCUSSION
        // - speaker matches via speakerSegment.speakerTag.personId
        // Then return the full time range (first start to last end)
        const utterances = await prisma.utterance.findMany({
            where: {
                discussionSubjectId: subjectId,
                discussionStatus: 'SUBJECT_DISCUSSION',
                speakerSegment: {
                    speakerTag: {
                        personId: speakerId
                    }
                }
            },
            select: {
                startTimestamp: true,
                endTimestamp: true,
            },
            orderBy: {
                startTimestamp: 'asc'
            }
        });

        if (utterances.length === 0) {
            return NextResponse.json(
                { error: 'No utterance found' },
                { status: 404 }
            );
        }

        // Return the full range: first utterance's start to last utterance's end
        return NextResponse.json({
            startTimestamp: utterances[0].startTimestamp,
            endTimestamp: utterances[utterances.length - 1].endTimestamp,
        });
    } catch (error) {
        console.error('Error fetching first utterance:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
