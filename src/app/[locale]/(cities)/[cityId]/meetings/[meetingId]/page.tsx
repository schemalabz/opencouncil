import { notFound } from 'next/navigation';
import { PrismaClient } from '@prisma/client'
import CouncilMeeting from '@/components/meetings/Meeting';

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
            speakerDiarizations: true,
            transcriptionRequest: true,
            speakerDiarizationRequest: true
        }
    })

    if (!meeting) {
        notFound();
    }

    return <CouncilMeeting meeting={meeting} editable={true} />
}