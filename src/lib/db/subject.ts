import prisma from "./prisma";
import { Subject, SubjectSpeakerSegment, SpeakerSegment, Highlight, Location, Topic, Person } from "@prisma/client";
import { Prisma } from "@prisma/client";

// Type for location with coordinates
type LocationWithCoordinates = Location & {
    coordinates?: {
        x: number;
        y: number;
    };
};

export type SubjectWithRelations = Subject & {
    speakerSegments: (SubjectSpeakerSegment & {
        speakerSegment: SpeakerSegment;
    })[];
    highlights: Highlight[];
    location: LocationWithCoordinates | null;
    topic: Topic | null;
    introducedBy: Person | null;
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
                location: true,
                topic: true,
                introducedBy: true,
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
        // First get the subjects with all relations using Prisma
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
                    orderBy: {
                        speakerSegment: {
                            startTimestamp: 'asc',
                        },
                    },
                },
                introducedBy: true,
                highlights: true,
                location: true,
                topic: true,
            },
        });

        // Then get the coordinates for locations that exist
        const locationIds = subjects.filter(s => s.location).map(s => s.location!.id);

        if (locationIds.length > 0) {
            const locationCoordinates = await prisma.$queryRaw<Array<{ id: string, x: number, y: number }>>`
                SELECT id, ST_X(coordinates::geometry) as x, ST_Y(coordinates::geometry) as y
                FROM "Location"
                WHERE id = ANY(${locationIds}::text[])
                AND type = 'point'
            `;

            // Merge coordinates into the subjects
            return subjects.map(subject => ({
                ...subject,
                location: subject.location ? {
                    ...subject.location,
                    coordinates: locationCoordinates.find(l => l.id === subject.location!.id)
                } : null
            }));
        }

        return subjects;
    } catch (error) {
        console.error('Error fetching subjects for meeting:', error);
        throw new Error('Failed to fetch subjects for meeting');
    }
}