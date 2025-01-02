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
import CouncilMeetingWrapper from '@/components/meetings/CouncilMeetingWrapper';
import Header from '@/components/meetings/Header';
import { SidebarProvider } from '@/components/ui/sidebar';
import MeetingSidebar from '@/components/meetings/sidebar';
import TranscriptControls from '@/components/meetings/TranscriptControls';
import { getStatisticsFor } from '@/lib/statistics';

export async function generateStaticParams({ params }: { params: { meetingId: string, cityId: string, locale: string } }) {
    const allCities = await getCities();
    const allMeetings = await Promise.all(allCities.map((city) => getCouncilMeetingsForCity(city.id)));
    return allMeetings.flat().map((meeting) => ({ meetingId: meeting.id, cityId: meeting.cityId, locale: "el" }));
}

export default async function CouncilMeetingPage({
    params: { meetingId, cityId, locale },
    children
}: {
    params: { meetingId: string; cityId: string, locale: string },
    children: React.ReactNode
}) {
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

    const subjectsWithStatistics = await Promise.all(subjects.map(async (subject) => ({
        ...subject,
        statistics: await getStatisticsFor(subject, ["person", "party"])
    })));

    if (!city || !meeting || !people || !parties || !transcript || !subjects) {
        console.log(`404, because ${!city ? 'city' : ''}${!meeting ? 'meeting' : ''}${!people ? 'people' : ''}${!parties ? 'parties' : ''}${!transcript ? 'transcript' : ''} don't exist`)
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
        transcript: transcript,
        highlights: highlights,
        subjects: subjectsWithStatistics
    }

    return <CouncilMeetingWrapper meetingData={meetingData} editable={isEditMode() && withUserAuthorizedToEdit({ councilMeetingId: meeting.id })}>
        <SidebarProvider>
            <MeetingSidebar />
            <div className="flex flex-col flex-1 mt-[65px]">
                <Header />
                <div className='mr-16 md:mr-0 md:mb-16'>
                    {children}
                </div>
            </div>
            <TranscriptControls />
        </SidebarProvider>
    </CouncilMeetingWrapper >
}