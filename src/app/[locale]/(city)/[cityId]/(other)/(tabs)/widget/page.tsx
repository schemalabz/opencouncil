import { notFound } from 'next/navigation';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { getCityCached, getAdministrativeBodiesWithPublicMeetingsCached, getCouncilMeetingsForCityPublicCached } from '@/lib/cache';
import { AdministrativeBodyType } from '@prisma/client';
import { EmbedConfigurator, type EmbedBodyGroup, type EmbedRecentMeeting } from '@/components/embed/EmbedConfigurator';
import { Metadata } from 'next';

// Embed configurator for city admins — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

const ADMIN_BODY_TYPE_ORDER: AdministrativeBodyType[] = ['council', 'committee', 'community'];

/** Choices offered by the summary widget's meeting picker. */
const RECENT_MEETINGS_LIMIT = 20;

export default async function WidgetPage(
    props: {
        params: Promise<{ cityId: string }>;
    }
) {
    const { cityId } = await props.params;

    const canEdit = await isUserAuthorizedToEdit({ cityId });
    if (!canEdit) notFound();

    const [city, bodies, pastMeetings] = await Promise.all([
        getCityCached(cityId),
        // Only bodies that have released meetings — the widget is public, so the
        // filter shouldn't offer bodies a visitor can't see any meetings for.
        getAdministrativeBodiesWithPublicMeetingsCached(cityId),
        // Same rule for the summary widget's meeting picker: released past meetings only.
        getCouncilMeetingsForCityPublicCached(cityId, { limit: RECENT_MEETINGS_LIMIT, timeFilter: 'past' }),
    ]);

    const bodyGroups: EmbedBodyGroup[] = ADMIN_BODY_TYPE_ORDER
        .map(type => ({
            type,
            bodies: bodies
                .filter(b => b.type === type)
                .map(b => ({ id: b.id, name: b.name, name_en: b.name_en })),
        }))
        .filter(group => group.bodies.length > 0);

    const recentMeetings: EmbedRecentMeeting[] = pastMeetings.map(meeting => ({
        id: meeting.id,
        name: meeting.name,
        name_en: meeting.name_en,
        dateTime: new Date(meeting.dateTime).toISOString(),
    }));

    return (
        <EmbedConfigurator
            cityId={cityId}
            cityName={city?.name}
            cityTimezone={city?.timezone}
            bodyGroups={bodyGroups}
            recentMeetings={recentMeetings}
        />
    );
}
