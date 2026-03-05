
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db/prisma';
import { findRelatedSubjects } from '@/lib/search/related';
import { RelatedSubjectResult } from '@/lib/search/types';
import { errors } from '@elastic/elasticsearch';

interface RelatedSubjectsResponse {
    sameBody: RelatedSubjectResult[];
    elsewhere: RelatedSubjectResult[];
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ subjectId: string }> }
) {
    const { subjectId } = await params;

    // Fetch source subject from DB (lightweight - only fields needed for the ES query)
    const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: {
            id: true,
            name: true,
            description: true, // Fetch description directly from Subject model
            cityId: true,
            topicId: true,
            councilMeeting: {
                select: {
                    administrativeBodyId: true,
                }
            }
        }
    });

    if (!subject) {
        return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    // description is now a first-class field on the Subject model.
    const subjectDescription = subject.description;

    let allResults: RelatedSubjectResult[];

    try {
        allResults = await findRelatedSubjects({
            subjectId: subject.id,
            subjectName: subject.name,
            subjectDescription,
            topicId: subject.topicId,
        });
    } catch (error) {
        // Detect ES-related errors and return 503
        if (
            error instanceof errors.ResponseError ||
            error instanceof errors.ConnectionError ||
            error instanceof errors.TimeoutError ||
            error instanceof errors.NoLivingConnectionsError
        ) {
            console.error('[related-subjects] Elasticsearch unavailable:', error);
            return NextResponse.json(
                { error: 'Search service temporarily unavailable' },
                { status: 503 }
            );
        }
        throw error;
    }

    const adminBodyId = subject.councilMeeting?.administrativeBodyId ?? null;

    // Group results: sameBody = same city AND same adminBody, sorted by date DESC
    // elsewhere = everything else, sorted by score DESC (already sorted by RRF)
    const sameBody: RelatedSubjectResult[] = [];
    const elsewhere: RelatedSubjectResult[] = [];

    for (const result of allResults) {
        if (
            result.cityId === subject.cityId &&
            adminBodyId !== null &&
            result.adminBodyId === adminBodyId
        ) {
            sameBody.push(result);
        } else {
            elsewhere.push(result);
        }
    }

    // Sort sameBody by meeting date, most recent first
    sameBody.sort((a, b) => {
        if (!a.meetingDate && !b.meetingDate) return 0;
        if (!a.meetingDate) return 1;
        if (!b.meetingDate) return -1;
        return new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime();
    });

    const response: RelatedSubjectsResponse = { sameBody, elsewhere };
    return NextResponse.json(response);
}
