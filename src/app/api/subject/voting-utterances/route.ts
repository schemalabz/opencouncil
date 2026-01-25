import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: NextRequest) {
    try {
        const { subjectId } = await request.json();

        if (!subjectId) {
            return NextResponse.json(
                { error: 'Subject ID is required' },
                { status: 400 }
            );
        }

        const utterances = await prisma.utterance.findMany({
            where: {
                discussionSubjectId: subjectId,
                discussionStatus: 'VOTE'
            },
            select: {
                id: true,
                text: true,
                startTimestamp: true,
                endTimestamp: true,
                speakerSegment: {
                    select: {
                        id: true,
                        speakerTagId: true,
                        speakerTag: {
                            select: {
                                id: true,
                                label: true,
                                personId: true,
                                person: {
                                    select: {
                                        id: true,
                                        name: true,
                                        image: true,
                                        roles: {
                                            include: {
                                                party: true
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: {
                startTimestamp: 'asc'
            }
        });

        return NextResponse.json({ utterances });
    } catch (error) {
        console.error('Error fetching voting utterances:', error);
        return NextResponse.json(
            { error: 'Failed to fetch voting utterances' },
            { status: 500 }
        );
    }
}
