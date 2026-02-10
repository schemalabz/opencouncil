"use server";
import { CouncilMeeting, Subject, AdministrativeBody } from '@prisma/client';
import { revalidateTag, revalidatePath } from 'next/cache';
import prisma from "./prisma";
import { withUserAuthorizedToEdit, isUserAuthorizedToEdit } from '../auth';
import { buildDateFilter } from './reviews/dateFilters';

export type CouncilMeetingWithAdminBody = CouncilMeeting & {
    administrativeBody: AdministrativeBody | null
}

export type CouncilMeetingWithAdminBodyAndSubjects = CouncilMeetingWithAdminBody & {
    subjects: Subject[]
}

export async function deleteCouncilMeeting(cityId: string, id: string): Promise<void> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        await prisma.councilMeeting.delete({
            where: { cityId_id: { cityId, id } },
        });
    } catch (error) {
        console.error('Error deleting council meeting:', error);
        throw new Error('Failed to delete council meeting');
    }
}

export async function createCouncilMeeting(meetingData: Omit<CouncilMeeting, 'createdAt' | 'updatedAt' | 'audioUrl' | 'videoUrl'> & { audioUrl?: string, videoUrl?: string }): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ cityId: meetingData.cityId });
    try {
        const newMeeting = await prisma.councilMeeting.create({
            data: meetingData,
            include: {
                administrativeBody: true
            }
        });
        return newMeeting;
    } catch (error) {
        console.error('Error creating council meeting:', error);
        throw new Error('Failed to create council meeting');
    }
}

export async function editCouncilMeeting(cityId: string, id: string, meetingData: Partial<Omit<CouncilMeeting, 'id' | 'cityId' | 'createdAt' | 'updatedAt'>>): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        const updatedMeeting = await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: meetingData,
            include: {
                administrativeBody: true
            }
        });
        return updatedMeeting;
    } catch (error) {
        console.error('Error editing council meeting:', error);
        throw new Error('Failed to edit council meeting');
    }
}

export async function getCouncilMeeting(cityId: string, id: string): Promise<CouncilMeetingWithAdminBody | null> {
    const startTime = performance.now();
    try {
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id } },
            include: {
                administrativeBody: true
            }
        });
        const endTime = performance.now();

        if (meeting && !meeting.released && !(await isUserAuthorizedToEdit({ cityId }))) {
            return null;
        }
        return meeting;
    } catch (error) {
        console.error('Error fetching council meeting:', error);
        throw new Error('Failed to fetch council meeting');
    }
}

export async function getCouncilMeetingsForCity(cityId: string, { includeUnreleased, limit }: { includeUnreleased?: boolean; limit?: number } = {}): Promise<CouncilMeetingWithAdminBodyAndSubjects[]> {

    try {
        // First, get meetings with subjects and basic relationships
        const meetings = await prisma.councilMeeting.findMany({
            where: { cityId, released: includeUnreleased ? undefined : true },
            orderBy: [
                { dateTime: 'desc' },
                { createdAt: 'desc' }
            ],
            ...(limit && { take: limit }),
            include: {
                subjects: {
                    orderBy: [
                        // Ensure hot subjects are first in the list 
                        { hot: 'desc' },
                        // Secondary ordering by agenda item index when available
                        { agendaItemIndex: 'asc' },
                        { name: 'asc' }
                    ],
                    include: {
                        topic: true,
                        // Include speaker segments through the junction table
                        speakerSegments: true // This gets all SubjectSpeakerSegment records
                    }
                },
                administrativeBody: true
            }
        });

        return meetings;
    } catch (error) {
        console.error('Error fetching council meetings for city:', error);
        throw new Error('Failed to fetch council meetings for city');
    }
}

export async function toggleMeetingRelease(cityId: string, id: string, released: boolean): Promise<CouncilMeetingWithAdminBody> {
    await withUserAuthorizedToEdit({ councilMeetingId: id, cityId: cityId });
    try {
        const updatedMeeting = await prisma.councilMeeting.update({
            where: { cityId_id: { cityId, id } },
            data: { released },
            include: {
                administrativeBody: true
            }
        });
        // TODO: utilize api/cities/[cityId]/meetings/[meetingId] to edit the meeting
        revalidateTag(`city:${cityId}:meetings`);
        revalidatePath(`/${cityId}`, "layout");
        return updatedMeeting;
    } catch (error) {
        console.error('Error toggling council meeting release:', error);
        throw new Error('Failed to toggle council meeting release');
    }
}

export async function getCouncilMeetingsCountForCity(cityId: string): Promise<number> {
    try {
        const count = await prisma.councilMeeting.count({
            where: {
                cityId,
                released: true
            }
        });
        return count;
    } catch (error) {
        console.error('Error counting council meetings for city:', error);
        throw new Error('Failed to count council meetings for city');
    }
}

export async function getMeetingDataForOG(cityId: string, meetingId: string) {
    try {
        const data = await prisma.councilMeeting.findUnique({
            where: {
                cityId_id: { cityId, id: meetingId },
                released: true
            },
            select: {
                name: true,
                dateTime: true,
                subjects: {
                    select: {
                        id: true,
                        name: true,
                        hot: true,
                        topic: {
                            select: {
                                colorHex: true
                            }
                        }
                    }
                },
                city: {
                    select: {
                        name_municipality: true,
                        logoImage: true
                    }
                }
            }
        });

        if (!data) return null;
        return data;
    } catch (error) {
        console.error('Error fetching meeting data for OG:', error);
        throw new Error('Failed to fetch meeting data for OG');
    }
}

export interface MeetingUploadMetrics {
    needsUpload: number; // Count of meetings
    scheduledFuture: number; // Count of future scheduled meetings
    oldestNeedsUpload: Date | null;
    earliestScheduledFuture: Date | null;
}

/**
 * Get meeting upload metrics: meetings needing upload and scheduled future meetings
 * These metrics are not review-specific, so they belong in meetings.ts
 */
export async function getMeetingUploadMetrics(last30Days: boolean = false): Promise<MeetingUploadMetrics> {
    const now = new Date();

    // Build date filter for past meetings (reuse shared utility)
    const dateFilter = buildDateFilter(last30Days);

    // Needs upload: past meetings without transcribe succeeded
    const needsUploadMeetings = await prisma.councilMeeting.findMany({
        where: {
            AND: [
                {
                    NOT: {
                        taskStatuses: {
                            some: {
                                type: 'transcribe',
                                status: 'succeeded'
                            }
                        }
                    }
                },
                dateFilter
            ]
        },
        select: {
            dateTime: true
        },
        orderBy: {
            dateTime: 'asc'
        }
    });

    // Scheduled future: meetings with dateTime in the future
    const scheduledFutureMeetings = await prisma.councilMeeting.findMany({
        where: {
            dateTime: {
                gt: now
            }
        },
        select: {
            dateTime: true
        },
        orderBy: {
            dateTime: 'asc'
        }
    });

    return {
        needsUpload: needsUploadMeetings.length,
        scheduledFuture: scheduledFutureMeetings.length,
        oldestNeedsUpload: needsUploadMeetings.length > 0 ? needsUploadMeetings[0].dateTime : null,
        earliestScheduledFuture: scheduledFutureMeetings.length > 0 ? scheduledFutureMeetings[0].dateTime : null,
    };
}
