import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCity } from '@/lib/db/cities';
import prisma from '@/lib/db/prisma';
import { IS_DEV } from '@/lib/utils';

// POST: Reset city (development only)
export async function POST(
    request: NextRequest,
    { params }: { params: { cityId: string } }
) {
    try {
        // Development mode check
        if (!IS_DEV) {
            return NextResponse.json({ error: 'Reset functionality only available in development mode' }, { status: 403 });
        }

        const user = await getCurrentUser();

        if (!user?.isSuperAdmin) {
            return NextResponse.json({ error: 'Unauthorized: Only superadmins can reset cities' }, { status: 401 });
        }

        const city = await getCity(params.cityId);
        if (!city) {
            return NextResponse.json({ error: 'City not found' }, { status: 404 });
        }

        // Reset all city data in a single transaction
        await prisma.$transaction(async (tx) => {
            // Delete in the correct order to avoid foreign key constraint issues

            // 1. Delete roles first (they reference people, parties, admin bodies)
            await tx.role.deleteMany({
                where: { cityId: params.cityId },
            });

            // 2. Delete task statuses and related meeting data
            await tx.taskStatus.deleteMany({
                where: { cityId: params.cityId },
            });

            // 3. Delete speaker segments and related data
            const segments = await tx.speakerSegment.findMany({
                where: { cityId: params.cityId },
                select: { id: true },
            });

            if (segments.length > 0) {
                const segmentIds = segments.map(s => s.id);

                // Delete utterances and words
                await tx.word.deleteMany({
                    where: {
                        utterance: {
                            speakerSegmentId: { in: segmentIds }
                        }
                    }
                });

                await tx.utterance.deleteMany({
                    where: { speakerSegmentId: { in: segmentIds } }
                });

                // Delete summaries and topic labels
                await tx.summary.deleteMany({
                    where: { speakerSegmentId: { in: segmentIds } }
                });

                await tx.topicLabel.deleteMany({
                    where: { speakerSegmentId: { in: segmentIds } }
                });

                // Delete subject speaker segments
                await tx.subjectSpeakerSegment.deleteMany({
                    where: { speakerSegmentId: { in: segmentIds } }
                });

                // Delete speaker segments
                await tx.speakerSegment.deleteMany({
                    where: { cityId: params.cityId }
                });
            }

            // 4. Delete highlights and their relations
            await tx.highlightedUtterance.deleteMany({
                where: {
                    highlight: {
                        cityId: params.cityId
                    }
                }
            });

            await tx.highlight.deleteMany({
                where: { cityId: params.cityId }
            });

            // 5. Delete subjects
            await tx.subject.deleteMany({
                where: { cityId: params.cityId }
            });

            // 6. Delete podcast specs and parts
            const meetings = await tx.councilMeeting.findMany({
                where: { cityId: params.cityId },
                select: { id: true }
            });

            if (meetings.length > 0) {
                const meetingIds = meetings.map(m => m.id);

                const podcastSpecs = await tx.podcastSpec.findMany({
                    where: { councilMeetingId: { in: meetingIds } },
                    select: { id: true }
                });

                if (podcastSpecs.length > 0) {
                    const podcastSpecIds = podcastSpecs.map(p => p.id);

                    await tx.podcastPartAudioUtterance.deleteMany({
                        where: {
                            podcastPart: {
                                podcastSpecId: { in: podcastSpecIds }
                            }
                        }
                    });

                    await tx.podcastPart.deleteMany({
                        where: { podcastSpecId: { in: podcastSpecIds } }
                    });

                    await tx.podcastSpec.deleteMany({
                        where: { id: { in: podcastSpecIds } }
                    });
                }
            }

            // 7. Delete council meetings
            await tx.councilMeeting.deleteMany({
                where: { cityId: params.cityId }
            });

            // 8. Delete voice prints
            await tx.voicePrint.deleteMany({
                where: {
                    person: {
                        cityId: params.cityId
                    }
                }
            });

            // 9. Delete speaker tags
            await tx.speakerTag.deleteMany({
                where: {
                    person: {
                        cityId: params.cityId
                    }
                }
            });

            // 10. Delete people
            await tx.person.deleteMany({
                where: { cityId: params.cityId }
            });

            // 11. Delete parties
            await tx.party.deleteMany({
                where: { cityId: params.cityId }
            });

            // 12. Delete administrative bodies
            await tx.administrativeBody.deleteMany({
                where: { cityId: params.cityId }
            });

            // 13. Delete notifications and related data
            await tx.notificationPreference.deleteMany({
                where: { cityId: params.cityId }
            });

            await tx.petition.deleteMany({
                where: { cityId: params.cityId }
            });

            // 14. Delete consultation related data
            await tx.consultationCommentUpvote.deleteMany({
                where: {
                    comment: {
                        cityId: params.cityId
                    }
                }
            });

            await tx.consultationComment.deleteMany({
                where: { cityId: params.cityId }
            });

            await tx.consultation.deleteMany({
                where: { cityId: params.cityId }
            });

            // 15. Delete city message
            await tx.cityMessage.deleteMany({
                where: { cityId: params.cityId }
            });

            // 16. Delete administration relationships
            await tx.administers.deleteMany({
                where: { cityId: params.cityId }
            });

            // 17. Finally, set the city back to pending
            await tx.city.update({
                where: { id: params.cityId },
                data: { isPending: true },
            });
        });

        return NextResponse.json({
            success: true,
            message: 'City reset successfully - all data deleted and city set to pending',
        });
    } catch (error) {
        console.error('Error resetting city:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
} 