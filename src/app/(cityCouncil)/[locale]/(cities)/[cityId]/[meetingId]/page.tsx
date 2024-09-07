"use server"
import { PrismaClient } from '@prisma/client'
import CouncilMeeting from '@/components/meetings/CouncilMeeting';
import { getPeopleForCity } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';
import { getCity } from '@/lib/db/cities';
import { notFound } from 'next/navigation';
import { getTranscript } from '@/lib/db/transcript';


export default async function CouncilMeetingPage({
    params: { meetingId, cityId }
}: {
    params: { meetingId: string; cityId: string }
}) {
    const prisma = new PrismaClient()

    const meeting = await prisma.councilMeeting.findUnique({
        where: {
            cityId_id: {
                cityId: cityId,
                id: meetingId
            }
        },
        include: {
            taskStatuses: true
        }
    })
    const transcript = await getTranscript(meetingId, cityId);
    const city = await getCity(cityId);
    const people = await getPeopleForCity(cityId);
    const parties = await getPartiesForCity(cityId);

    if (!city || !meeting || !people || !parties || !transcript) {
        notFound();
    }

    const speakerTags = Array.from(new Set(transcript.map((segment) => segment.speakerTag.id)))
        .map(id => transcript.find(s => s.speakerTag.id === id)?.speakerTag)
        .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined);

    const meetingData = {
        meeting: meeting,
        city: city,
        people: people,
        parties: parties,
        speakerTags: speakerTags,
        transcript: transcript
    }

    return <CouncilMeeting meetingData={meetingData} editable={true} />
}