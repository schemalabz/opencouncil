"use server";
import { notFound } from 'next/navigation';
import { getCurrentUser, isUserAuthorizedToEdit } from '@/lib/auth';
import CouncilMeetingWrapper from '@/components/meetings/CouncilMeetingWrapper';
import { SidebarProvider } from '@/components/ui/sidebar';
import MeetingSidebar from '@/components/meetings/sidebar';
import TranscriptControls from '@/components/meetings/TranscriptControls';
import { Suspense } from 'react'
import Header from '@/components/layout/Header';
import EditButton from '@/components/meetings/EditButton';
import PresentationViewButton from '@/components/meetings/PresentationViewButton';
import ShareDropdown from '@/components/meetings/ShareDropdown';
import { getMeetingDataCached } from '@/lib/getMeetingData';
import { getNotificationPreferenceForCity } from '@/lib/db/notifications';
import { NavigationEvents } from '@/components/meetings/NavigationEvents';

import { HighlightModeBar } from '@/components/meetings/HighlightModeBar';
import { ShareProvider } from '@/contexts/ShareContext';
import { CreateHighlightButton } from '@/components/meetings/CreateHighlightButton';
import { HighlightProvider } from '@/components/meetings/HighlightContext';
import { EditingModeBar } from '@/components/meetings/EditingModeBar';
import { HighlightCreationPermission } from '@prisma/client';
import { SubjectHeaderProvider } from '@/contexts/SubjectHeaderContext';
import { NotificationPreferenceProvider } from '@/contexts/NotificationPreferenceContext';
import { getTranslations } from 'next-intl/server';

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

    const currentUser = await getCurrentUser();
    const editable = await isUserAuthorizedToEdit({ cityId });

    const data = await getMeetingDataCached(cityId, meetingId);

    if (!data || !data.city) {
        notFound();
    }

    console.log(`Got meeting data for ${cityId} ${meetingId}: ${data.meeting.updatedAt}`);

    const notificationPreference = currentUser
        ? await getNotificationPreferenceForCity(currentUser.id, cityId)
        : null;

    const meetingData = (data.transcriptHiddenForReview && !editable)
        ? { ...data, transcript: [], speakerTags: [] }
        : data;

    const highlightCreationAllowed = editable || (
        !!currentUser &&
        data.city.highlightCreationPermission === HighlightCreationPermission.EVERYONE
    );

    // Build admin body breadcrumb link with proper filter params
    const adminBody = data.meeting.administrativeBody;
    const tCommon = await getTranslations({ locale, namespace: 'Common' });
    const adminBodyPath = adminBody ? {
        name: adminBody.name,
        link: `/${cityId}?filters=${encodeURIComponent(tCommon(`adminBodyType_${adminBody.type}`))}&body=${encodeURIComponent(adminBody.name)}`
    } : null;

    return (
        <ShareProvider>
            <NotificationPreferenceProvider notificationPreference={notificationPreference}>
            <CouncilMeetingWrapper
                meetingData={meetingData}
                editable={editable}
                canCreateHighlights={highlightCreationAllowed}
            >
                <HighlightProvider>
                    <SubjectHeaderProvider>
                        <SidebarProvider>
                            <NavigationEvents />
                            <div className="h-screen w-full flex flex-col overflow-hidden">
                                <Header
                                    path={[
                                        {
                                            name: data.city.name,
                                            link: `/${cityId}`,
                                            city: data.city
                                        },
                                        ...(adminBodyPath ? [adminBodyPath] : []),
                                        {
                                            name: data.meeting.name,
                                            link: `/${cityId}/${meetingId}`
                                        }
                                    ]}
                                    showSidebarTrigger={true}
                                    currentEntity={{ cityId: data.city.id }}
                                    noContainer={true}
                                    className="relative z-10 bg-white dark:bg-gray-950"
                                >
                                    <div className="flex items-center space-x-2">
                                        <EditButton />
                                        <CreateHighlightButton />
                                        {editable && <PresentationViewButton cityId={cityId} meetingId={meetingId} />}
                                        <ShareDropdown meetingId={meetingId} cityId={cityId} />
                                    </div>
                                </Header>
                                <HighlightModeBar />
                                <EditingModeBar />
                                <div className="flex-1 flex min-h-0">
                                    <MeetingSidebar />
                                    <div className="relative flex-1 overflow-auto" data-scroll-container>
                                        <div className='pb-20'>
                                            <Suspense>
                                                {children}
                                            </Suspense>
                                        </div>
                                        {data.meeting.muxPlaybackId && <TranscriptControls />}
                                    </div>
                                </div>
                            </div>
                        </SidebarProvider>
                    </SubjectHeaderProvider>
                </HighlightProvider>
            </CouncilMeetingWrapper>
            </NotificationPreferenceProvider>
        </ShareProvider>
    );
}