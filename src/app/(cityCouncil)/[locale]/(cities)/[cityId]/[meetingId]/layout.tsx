"use server";
import { getPeopleForCity } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';
import { getCities, getCity } from '@/lib/db/cities';
import { notFound } from 'next/navigation';
import { getTranscript } from '@/lib/db/transcript';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
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
import { getMeetingData, MeetingData } from '@/lib/getMeetingData';
import { cache } from 'react'

/*
export async function generateStaticParams({ params }: { params: { meetingId: string, cityId: string, locale: string } }) {
    const allCities = await getCities();
    const allMeetings = await Promise.all(allCities.map((city) => getCouncilMeetingsForCity(city.id)));
    return allMeetings.flat().map((meeting) => ({ meetingId: meeting.id, cityId: meeting.cityId, locale: "el" }));
}
*/

const getMeetingDataCached = cache(async (cityId: string, meetingId: string) => {
    const t = performance.now();
    console.log("Getting data...");
    const data = await getMeetingData(cityId, meetingId);
    console.log(`Got data in ${performance.now() - t}ms`);
    return data;
});

export async function generateImageMetadata({
    params: { meetingId, cityId }
}: {
    params: { meetingId: string; cityId: string }
}) {
    const data = await getMeetingDataCached(cityId, meetingId);

    if (!data || !data.city) {
        return [];
    }

    return [
        {
            contentType: 'image/png',
            size: { width: 1200, height: 630 },
            id: 'og',
            alt: data.meeting.name,
            url: `/api/og?meetingId=${meetingId}&cityId=${cityId}`
        },
        {
            contentType: 'image/png',
            size: { width: 32, height: 32 },
            id: 'icon',
            alt: data.meeting.name,
            url: `/api/icon?meetingId=${meetingId}&cityId=${cityId}`
        }
    ];
}

export async function generateMetadata({
    params: { meetingId, cityId }
}: {
    params: { meetingId: string; cityId: string }
}) {
    const data = await getMeetingDataCached(cityId, meetingId);

    if (!data || !data.city) {
        return {
            title: 'Not Found'
        };
    }

    return {
        title: data.meeting.name,
        description: `${data.meeting.name} | ${data.meeting.name} | OpenCouncil`,
        openGraph: {
            title: data.meeting.name,
            description: `${data.meeting.name} | ${data.city.name}`,
            images: [{
                url: `/api/og?meetingId=${meetingId}&cityId=${cityId}`,
                width: 1200,
                height: 630,
            }]
        }
    };
}

export default async function CouncilMeetingPage({
    params: { meetingId, cityId, locale },
    children
}: {
    params: { meetingId: string; cityId: string, locale: string },
    children: React.ReactNode
}) {
    unstable_setRequestLocale(locale);

    const data = await getMeetingDataCached(cityId, meetingId);

    if (!data || !data.city) {
        notFound();
    }

    console.log(`Got meeting data for ${cityId} ${meetingId}: ${data.meeting.updatedAt}`);

    const editable = await isUserAuthorizedToEdit({ councilMeetingId: data.meeting.id });
    return <CouncilMeetingWrapper meetingData={data} editable={editable}>
        <SidebarProvider>
            <MeetingSidebar />
            <div className="flex flex-col flex-1">
                <Header />
                <div className='mr-16 md:mr-0 md:mb-16'>
                    {children}
                </div>
            </div>
            {data.meeting.muxPlaybackId && <TranscriptControls />}
        </SidebarProvider>
    </CouncilMeetingWrapper >
}