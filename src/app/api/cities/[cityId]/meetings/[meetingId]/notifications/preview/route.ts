import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import { calculateProximityMatches } from '@/lib/db/notifications';

export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string; meetingId: string } }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { subjectImportances } = await request.json();

        const { cityId, meetingId } = params;

        // Fetch meeting with subjects
        const meeting = await prisma.councilMeeting.findUnique({
            where: { cityId_id: { cityId, id: meetingId } },
            include: {
                subjects: {
                    include: {
                        topic: true,
                        location: true
                    }
                }
            }
        });

        if (!meeting) {
            return new NextResponse('Meeting not found', { status: 404 });
        }

        // Get all users with notification preferences for this city
        const usersWithPreferences = await prisma.notificationPreference.findMany({
            where: { cityId },
            include: {
                user: true,
                locations: true,
                interests: true
            }
        });

        // Track user counts for each subject
        const subjectImpact = new Map<string, number>();
        let totalUniqueUsers = new Set<string>();

        // Process each subject
        for (const subject of meeting.subjects) {
            const importance = subjectImportances[subject.id] || {
                topicImportance: 'doNotNotify',
                proximityImportance: 'none'
            };

            const { topicImportance, proximityImportance } = importance;

            let matchedUsers = new Set<string>();

            for (const userPref of usersWithPreferences) {
                const userId = userPref.userId;

                // Rule 1: High importance - notify everyone
                if (topicImportance === 'high') {
                    matchedUsers.add(userId);
                    totalUniqueUsers.add(userId);
                    continue;
                }

                // Rule 2: Normal topic importance + user is interested in the topic
                if (topicImportance === 'normal' && subject.topicId) {
                    const isInterestedInTopic = userPref.interests.some(t => t.id === subject.topicId);
                    if (isInterestedInTopic) {
                        matchedUsers.add(userId);
                        totalUniqueUsers.add(userId);
                        continue;
                    }
                }

                // Rule 3 & 4: Proximity-based matching
                if (proximityImportance !== 'none' && subject.locationId && userPref.locations.length > 0) {
                    const distanceMeters = proximityImportance === 'near' ? 250 : 1000;
                    const userLocationIds = userPref.locations.map(l => l.id);

                    const isNearby = await calculateProximityMatches(
                        userLocationIds,
                        subject.locationId,
                        distanceMeters
                    );

                    if (isNearby) {
                        matchedUsers.add(userId);
                        totalUniqueUsers.add(userId);
                    }
                }
            }

            subjectImpact.set(subject.id, matchedUsers.size);
        }

        return NextResponse.json({
            totalUsers: totalUniqueUsers.size,
            subjectImpact: Object.fromEntries(subjectImpact)
        });

    } catch (error) {
        console.error('Error calculating notification impact:', error);
        return new NextResponse('Internal server error', { status: 500 });
    }
}

