"use server";
import { getPeopleForCity } from '@/lib/db/people';
import { getPartiesForCity } from '@/lib/db/parties';
import { getCities, getCity } from '@/lib/db/cities';
import { notFound } from 'next/navigation';
import { getTranscript } from '@/lib/db/transcript';
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from '@/lib/auth';
import { getCouncilMeeting, getCouncilMeetingsForCity } from '@/lib/db/meetings';
import { getHighlightsForMeeting } from '@/lib/db/highlights';
import { getSubjectsForMeeting } from '@/lib/db/subject';
import CouncilMeetingWrapper from '@/components/meetings/CouncilMeetingWrapper';
import { SidebarProvider } from '@/components/ui/sidebar';
import MeetingSidebar from '@/components/meetings/sidebar';
import TranscriptControls from '@/components/meetings/TranscriptControls';
import { getStatisticsFor } from '@/lib/statistics';
import { getMeetingData, MeetingData } from '@/lib/getMeetingData';
import { cache } from 'react'
import Header from '@/components/layout/Header';
import { CalendarIcon, FileIcon, FileText, ExternalLink, VideoIcon } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { formatDate } from 'date-fns';
import { el, enUS } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';
import EditSwitch from '@/components/meetings/edit-switch';
import { getMeetingDataCached } from '@/lib/cachedData';

/*
export async function generateStaticParams({ params }: { params: { meetingId: string, cityId: string, locale: string } }) {
    const allCities = await getCities();
    const allMeetings = await Promise.all(allCities.map((city) => getCouncilMeetingsForCity(city.id)));
    return allMeetings.flat().map((meeting) => ({ meetingId: meeting.id, cityId: meeting.cityId, locale: "el" }));
}
*/


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

    // Create an optimized title between 30-60 characters
    const optimizedTitle = `${data.city.name} - ${data.meeting.name} | OpenCouncil`;

    // Use the hero text for description, which is already optimized for Greek audience
    const description = "To OpenCouncil χρησιμοποιεί τεχνητή νοημοσύνη για να παρακολουθεί τα δημοτικά συμβούλια και να τα κάνει απλά και κατανοητά";

    const imageUrl = `/api/og?meetingId=${meetingId}&cityId=${cityId}`;

    return {
        title: optimizedTitle,
        description,
        openGraph: {
            title: optimizedTitle,
            description,
            images: [{
                url: imageUrl,
                width: 1200,
                height: 630,
                alt: `${data.meeting.name} - ${data.city.name} Δημοτικό Συμβούλιο`
            }]
        },
        twitter: {
            card: 'summary_large_image',
            title: optimizedTitle,
            description,
            images: [imageUrl],
            creator: '@opencouncil',
            site: '@opencouncil'
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

    const data = await getMeetingDataCached(cityId, meetingId);

    if (!data || !data.city) {
        notFound();
    }

    console.log(`Got meeting data for ${cityId} ${meetingId}: ${data.meeting.updatedAt}`);

    const editable = await isUserAuthorizedToEdit({ councilMeetingId: data.meeting.id });

    // Format meeting description to include more info
    const meetingDescription = [
        formatDate(new Date(data.meeting.dateTime), 'EEEE, d MMMM yyyy', { locale: locale === 'el' ? el : enUS }),
        data.meeting.videoUrl ? "Βίντεο διαθέσιμο" : null,
        `${data.subjects.length} θέματα`
    ].filter(Boolean).join(' · ');

    return (
        <CouncilMeetingWrapper meetingData={data} editable={editable}>
            <SidebarProvider>
                <div className="h-screen w-full flex flex-col overflow-hidden">
                    <Header
                        path={[
                            {
                                name: data.city.name,
                                link: `/${cityId}`,
                                city: data.city
                            },
                            {
                                name: data.meeting.name,
                                link: `/${cityId}/${meetingId}`,
                                description: meetingDescription
                            }
                        ]}
                        showSidebarTrigger={true}
                        currentEntity={{ cityId: data.city.id }}
                        noContainer={true}
                    >
                        <EditSwitch />
                    </Header>
                    <div className="flex-1 flex min-h-0">
                        <MeetingSidebar />
                        <div className="flex-1 overflow-auto">
                            <div className='pb-20'>
                                {children}
                            </div>
                            {data.meeting.muxPlaybackId && <TranscriptControls />}
                        </div>
                    </div>
                </div>
            </SidebarProvider>
        </CouncilMeetingWrapper>
    );
}