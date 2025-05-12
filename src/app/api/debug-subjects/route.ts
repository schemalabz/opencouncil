import { NextRequest } from 'next/server';
import prisma from '@/lib/db/prisma';
import { getSubject } from '@/lib/db/subject';
import { getCity } from '@/lib/db/cities';
import { getCouncilMeeting } from '@/lib/db/meetings';
import { getPeopleForCity } from '@/lib/db/people';
import { getStatisticsFor } from '@/lib/statistics';

export async function GET(req: NextRequest) {
    try {
        // Get the count parameter from the query string, default to 3
        const url = new URL(req.url);
        const count = parseInt(url.searchParams.get('count') || '3', 10);

        console.log(`Debug: Fetching ${count} random subjects...`);

        // Get random subjects
        const subjects = await prisma.subject.findMany({
            take: count,
            where: {
                description: {
                    not: '',
                },
            },
            include: {
                topic: true,
                location: true,
                introducedBy: {
                    include: {
                        party: true,
                        roles: {
                            include: {
                                party: true,
                                city: true,
                                administrativeBody: true,
                            },
                        },
                    },
                },
            },
        });

        console.log(`Debug: Found ${subjects.length} subjects`);

        if (subjects.length === 0) {
            return new Response(JSON.stringify({
                message: 'No subjects found in the database',
                count: 0,
                subjects: []
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Return basic subject info for debugging
        const basicSubjects = subjects.map(subject => ({
            id: subject.id,
            name: subject.name,
            description: subject.description,
            cityId: subject.cityId,
            councilMeetingId: subject.councilMeetingId,
            introducedById: subject.personId,
            topicName: subject.topic?.name,
            locationText: subject.location?.text,
        }));

        return new Response(JSON.stringify({
            message: 'Subjects found successfully',
            count: subjects.length,
            subjects: basicSubjects
        }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        console.error('Error in debug-subjects route:', error);
        return new Response(JSON.stringify({
            error: 'Error fetching subjects',
            message: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
} 