"use server"
import { PrismaClient } from '@prisma/client'
import CouncilMeeting from '@/components/meetings/CouncilMeeting';
import { getPeopleForCity } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';
import { getCity } from '@/lib/db/cities';
import { notFound } from 'next/navigation';


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
            taskStatuses: true,
            utterances: {
                include: {
                    words: true,
                    speakerTag: true
                }
            },
        }
    })

    const city = await getCity(cityId);
    const people = await getPeopleForCity(cityId);
    const parties = await getPartiesForCity(cityId);
    if (!city || !meeting || !people || !parties) {
        notFound();
    }
    const speakerTags = Array.from(new Set(meeting?.utterances.map((utterance) => utterance.speakerTag.id)))
        .map(id => meeting?.utterances.find(u => u.speakerTag.id === id)?.speakerTag)
        .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined);

    return <CouncilMeeting meeting={meeting} editable={true} city={city} parties={parties} people={people} speakerTags={speakerTags} />
}