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
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';
import { getLocalizedName } from '@/lib/formatters/name';
import { buildOgImageUrl } from '@/lib/og/locale';
import { getRealm } from '@/lib/realm.server';
import { hasExplainPage } from '@/lib/explain/availability';

export async function generateImageMetadata(
    props: {
        params: Promise<{ meetingId: string; cityId: string; locale: string }>
    }
) {
    const { meetingId, cityId, locale } = await props.params;

    const data = await getMeetingDataCached(cityId, meetingId);

    if (!data || !data.city) {
        return [];
    }

    const meetingName = getLocalizedName(data.meeting, locale);

    return [
        {
            contentType: 'image/png',
            size: { width: 1200, height: 630 },
            id: 'og',
            alt: meetingName,
            url: buildOgImageUrl(locale, { meetingId, cityId })
        },
        {
            contentType: 'image/png',
            size: { width: 32, height: 32 },
            id: 'icon',
            alt: meetingName,
            url: `/api/icon?meetingId=${meetingId}&cityId=${cityId}`
        }
    ];
}

export async function generateMetadata(
    props: {
        params: Promise<{ meetingId: string; cityId: string; locale: string }>
    }
) {
    const params = await props.params;

    const {
        meetingId,
        cityId,
        locale
    } = params;

    const data = await getMeetingDataCached(cityId, meetingId);

    if (!data || !data.city) {
        // Thrown here (not just in the body below) so crawlers, which get
        // blocking metadata via htmlLimitedBots, receive a real HTTP 404.
        notFound();
    }

    // Create an optimized title between 30-60 characters
    const optimizedTitle = `${getLocalizedName(data.city, locale)} - ${getLocalizedName(data.meeting, locale)} | OpenCouncil`;

    // Use the hero text for description, which is already optimized for Greek audience
    const description = "To OpenCouncil χρησιμοποιεί τεχνητή νοημοσύνη για να παρακολουθεί τα δημοτικά συμβούλια και να τα κάνει απλά και κατανοητά";

    const imageUrl = buildOgImageUrl(locale, { meetingId, cityId });

    return {
        title: optimizedTitle,
        description,
        alternates: await buildCanonicalAlternates(`/${cityId}/${meetingId}`),
        openGraph: {
            title: optimizedTitle,
            description,
            images: [{
                url: imageUrl,
                width: 1200,
                height: 630,
                alt: `${getLocalizedName(data.meeting, locale)} - ${getLocalizedName(data.city, locale)}`
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

export default async function CouncilMeetingPage(
    props: {
        params: Promise<{ meetingId: string; cityId: string, locale: string }>,
        children: React.ReactNode
    }
) {
    const params = await props.params;

    const {
        meetingId,
        cityId,
        locale
    } = params;

    const {
        children
    } = props;

    const currentUserPromise = getCurrentUser();
    const [currentUser, editable, data, notificationPreference, realm] = await Promise.all([
        currentUserPromise,
        isUserAuthorizedToEdit({ cityId }),
        getMeetingDataCached(cityId, meetingId),
        currentUserPromise.then(user =>
            user ? getNotificationPreferenceForCity(user.id, cityId) : null
        ),
        getRealm(),
    ]);

    if (!data || !data.city) {
        notFound();
    }

    console.log(`Got meeting data for ${cityId} ${meetingId}: ${data.meeting.updatedAt}`);

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
    // Display name is localized; the `body` query param stays canonical — it
    // filters against stored values.
    const adminBodyPath = adminBody ? {
        name: getLocalizedName(adminBody, locale),
        link: `/${cityId}/meetings?filters=${encodeURIComponent(tCommon(`adminBodyType_${adminBody.type}`))}&body=${encodeURIComponent(adminBody.name)}`
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
                                            name: getLocalizedName(data.city, locale),
                                            link: `/${cityId}`,
                                            city: data.city
                                        },
                                        ...(adminBodyPath ? [adminBodyPath] : []),
                                        {
                                            name: getLocalizedName(data.meeting, locale),
                                            link: `/${cityId}/${meetingId}`
                                        }
                                    ]}
                                    showSidebarTrigger={true}
                                    currentEntity={{ cityId: data.city.id }}
                                    noContainer={true}
                                    showExplain={hasExplainPage(realm)}
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