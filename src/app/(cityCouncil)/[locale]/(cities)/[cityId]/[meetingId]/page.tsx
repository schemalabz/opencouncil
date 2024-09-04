import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client'
import CouncilMeeting from '@/components/meetings/CouncilMeeting';

const prisma = new PrismaClient()

export default async function CouncilMeetingPage({
    params: { meetingId, cityId }
}: {
    params: { meetingId: string; cityId: string }
}) {
    const meeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                cityId: cityId,
                id: meetingId
            }
        },
        include: {
            taskStatuses: true,
            utterances: {
                include: {
                    words: true,
                    speakerTag: true
                }
            },
        }
    })

    const city = await prisma.city.findUnique({
        where: {
            id: cityId
        }, include: {
            persons: true,
            parties: true
        }
    })

    if (!city) {
        notFound();
    }

    if (!meeting) {
        notFound();
    }

    return <CouncilMeeting meeting={meeting} editable={true} city={city} />
}