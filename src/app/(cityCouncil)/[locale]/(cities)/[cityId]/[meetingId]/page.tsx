import CouncilMeeting from '@/components/meetings/CouncilMeeting';
import { getPeopleForCity } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';
import { getCities, getCity } from '@/lib/db/cities';
import { notFound } from 'next/navigation';
import { getTranscript } from '@/lib/db/transcript';
import { isEditMode, withUserAuthorizedToEdit } from '@/lib/auth';
import { getCouncilMeeting, getCouncilMeetingsForCity } from '@/lib/db/meetings';
import { unstable_setRequestLocale } from 'next-intl/server';
import { getHighlightsForMeeting } from '@/lib/db/highlights';
import { getSubjectsForMeeting } from '@/lib/db/subject';

export async function generateStaticParams() {
    if (process.env.EDIT_MODE !== 'true') {
        const allCities = await getCities();
        const allMeetings = await Promise.all(allCities.map((city) => getCouncilMeetingsForCity(city.id)));
        return allMeetings.flat().map((meeting) => ({ meetingId: meeting.id, cityId: meeting.cityId, locale: "el" }));
    }
    return [];
}
export const revalidate = 60;
export const dynamicParams = true;


export default async function CouncilMeetingPage({
    params
}: {
    params: Promise<{ meetingId: string; cityId: string, locale: string }>
}) {
    const { meetingId, cityId, locale } = await params;
    unstable_setRequestLocale(locale);

    const startTime = performance.now();
    const [meeting, transcript, city, people, parties, highlights, subjects] = await Promise.all([
        getCouncilMeeting(cityId, meetingId),
        getTranscript(meetingId, cityId),
        getCity(cityId),
        getPeopleForCity(cityId),
        getPartiesForCity(cityId),
        getHighlightsForMeeting(cityId, meetingId),
        getSubjectsForMeeting(cityId, meetingId)
    ]);
    const endTime = performance.now();
    console.log(`Time taken to load meeting: ${endTime - startTime} milliseconds`);

    console.log('topicLabelCount', transcript.reduce((acc, segment) => {
        return acc + segment.topicLabels.length;
    }, 0));

    if (!city || !meeting || !people || !parties || !transcript || !subjects) {
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
        transcript: transcript,
        highlights: highlights,
        subjects: subjects
    }

    return <CouncilMeeting meetingData={meetingData} editable={isEditMode() && withUserAuthorizedToEdit({ councilMeetingId: meeting.id })} />
}