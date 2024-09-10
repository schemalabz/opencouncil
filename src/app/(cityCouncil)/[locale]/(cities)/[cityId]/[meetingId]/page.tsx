import CouncilMeeting from '@/components/meetings/CouncilMeeting';
import { getPeopleForCity } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';
import { getCities, getCity } from '@/lib/db/cities';
import { notFound } from 'next/navigation';
import { getTranscript } from '@/lib/db/transcript';
import { isEditMode, withUserAuthorizedToEdit } from '@/lib/auth';
import { getCouncilMeeting, getCouncilMeetingsForCity } from '@/lib/db/meetings';
import { unstable_setRequestLocale } from 'next-intl/server';

export async function generateStaticParams({ params }: { params: { meetingId: string, cityId: string, locale: string } }) {
    const allCities = await getCities();
    const allMeetings = await Promise.all(allCities.map((city) => getCouncilMeetingsForCity(city.id)));
    return allMeetings.flat().map((meeting) => ({ meetingId: meeting.id, cityId: meeting.cityId, locale: "el" }));
}

export default async function CouncilMeetingPage({
    params: { meetingId, cityId, locale }
}: {
    params: { meetingId: string; cityId: string, locale: string }
}) {
    unstable_setRequestLocale(locale);

    const startTime = performance.now();
    const [meeting, transcript, city, people, parties] = await Promise.all([
        getCouncilMeeting(cityId, meetingId),
        getTranscript(meetingId, cityId),
        getCity(cityId),
        getPeopleForCity(cityId),
        getPartiesForCity(cityId)
    ]);
    const endTime = performance.now();
    console.log(`Time taken to load meeting: ${endTime - startTime} milliseconds`);

    if (!city || !meeting || !people || !parties || !transcript) {
        console.log(`404, because ${!city ? 'city' : ''}${!meeting ? 'meeting' : ''}${!people ? 'people' : ''}${!parties ? 'parties' : ''}${!transcript ? 'transcript' : ''} don't exist`)
        notFound();
    }
    console.log('=> Found everything');

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

    return <CouncilMeeting meetingData={meetingData} editable={isEditMode() && withUserAuthorizedToEdit({ councilMeetingId: meeting.id })} />
}