import prisma from "./prisma";
import { Subject, SubjectSpeakerSegment, SpeakerSegment, Highlight } from "@prisma/client";

export type SubjectWithRelations = Subject & {
    speakerSegments: (SubjectSpeakerSegment & {
        speakerSegment: SpeakerSegment;
    })[];
    highlights: Highlight[];
};

export async function getAllSubjects(): Promise<SubjectWithRelations[]> {
    try {
        const subjects = await prisma.subject.findMany({
            include: {
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                },
                highlights: true,
            },
        });
        return subjects;
    } catch (error) {
        console.error('Error fetching all subjects:', error);
        throw new Error('Failed to fetch all subjects');
    }
}

export async function getSubjectsForMeeting(cityId: string, councilMeetingId: string): Promise<SubjectWithRelations[]> {
    try {
        const subjects = await prisma.subject.findMany({
            where: {
                cityId,
                councilMeetingId,
            },
            include: {
                speakerSegments: {
                    include: {
                        speakerSegment: true,
                    },
                },
                highlights: true,
            },
        });
        return subjects;
    } catch (error) {
        console.error('Error fetching subjects for meeting:', error);
        throw new Error('Failed to fetch subjects for meeting');
    }
}