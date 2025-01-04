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
import { MeetingData } from '@/lib/getMeetingData';

/*
export async function generateStaticParams({ params }: { params: { meetingId: string, cityId: string, locale: string } }) {
    const allCities = await getCities();
    const allMeetings = await Promise.all(allCities.map((city) => getCouncilMeetingsForCity(city.id)));
    return allMeetings.flat().map((meeting) => ({ meetingId: meeting.id, cityId: meeting.cityId, locale: "el" }));
}
*/

export default async function CouncilMeetingPage({
    params: { meetingId, cityId, locale },
    children
}: {
    params: { meetingId: string; cityId: string, locale: string },
    children: React.ReactNode
}) {
    unstable_setRequestLocale(locale);

    const res = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/cities/${cityId}/meetings/${meetingId}`);
    const data: MeetingData = await res.json();
    if (!data || !data.city || !data.meeting || !data.people || !data.parties || !data.transcript || !data.subjects) {
        notFound();
    }

    console.log(`Got meeting data for ${cityId} ${meetingId}: ${data.meeting.updatedAt}`);

    return <CouncilMeetingWrapper meetingData={data} editable={isEditMode() && withUserAuthorizedToEdit({ councilMeetingId: data.meeting.id })}>
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