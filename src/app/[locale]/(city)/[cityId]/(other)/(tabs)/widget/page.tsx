import { notFound } from 'next/navigation';
import { isUserAuthorizedToEdit } from '@/lib/auth';
import { getCityCached, getAdministrativeBodiesWithPublicMeetingsCached, getCouncilMeetingsForCityPublicCached } from '@/lib/cache';
import { getBodyPageRow } from '@/lib/db/administrativeBodies';
import { EmbedConfigurator, type EmbedBodyGroup, type EmbedRecentMeeting } from '@/components/embed/EmbedConfigurator';
import { Metadata } from 'next';
import { ADMIN_BODY_TYPE_ORDER } from '@/lib/utils/administrativeBodies';
import { firstSearchParam } from '@/lib/utils/searchParams';
import { meetingLabel } from '@/lib/meetingName';
import { DEFAULT_TIMEZONE } from '@/lib/formatters/time';

// Embed configurator for city admins — nothing to index.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

/** Choices offered by the summary widget's meeting picker. */
const RECENT_MEETINGS_LIMIT = 20;

/**
 * The configurator of a city's widgets, for an editor of the city. With
 * `?body=`, the configurator of one body's widgets, for an admin of that body
 * (#829): the page of the body links here, and the widget shows that body
 * alone.
 */
export default async function WidgetPage(
    props: {
        params: Promise<{ cityId: string }>;
        searchParams: Promise<{ body?: string | string[] }>;
    }
) {
    const [{ cityId }, searchParams] = await Promise.all([props.params, props.searchParams]);
    const bodyId = firstSearchParam(searchParams.body) || null;

    const canEdit = await isUserAuthorizedToEdit(bodyId ? { cityId, administrativeBodyId: bodyId } : { cityId });
    if (!canEdit) notFound();

    const [city, bodies, pastMeetings, lockedBody] = await Promise.all([
        getCityCached(cityId),
        // Only bodies that have released meetings — the widget is public, so the
        // filter shouldn't offer bodies a visitor can't see any meetings for.
        getAdministrativeBodiesWithPublicMeetingsCached(cityId),
        // Same rule for the summary widget's meeting picker: released past meetings only.
        getCouncilMeetingsForCityPublicCached(cityId, {
            limit: RECENT_MEETINGS_LIMIT, timeFilter: 'past', ...(bodyId ? { administrativeBodyIds: [bodyId] } : {}),
        }),
        // The body itself, released meetings or not: its admin configures the
        // widget before the first meeting is out.
        bodyId ? getBodyPageRow(cityId, bodyId) : null,
    ]);
    if (bodyId && !lockedBody) notFound();

    const bodyGroups: EmbedBodyGroup[] = lockedBody
        ? [{ type: lockedBody.type, bodies: [{ id: lockedBody.id, name: lockedBody.name, name_en: lockedBody.name_en }] }]
        : ADMIN_BODY_TYPE_ORDER
            .map(type => ({
                type,
                bodies: bodies
                    .filter(b => b.type === type)
                    .map(b => ({ id: b.id, name: b.name, name_en: b.name_en })),
            }))
            .filter(group => group.bodies.length > 0);

    const recentMeetings: EmbedRecentMeeting[] = pastMeetings.map(meeting => ({
        id: meeting.id,
        name: meetingLabel(meeting, 'el', city?.timezone ?? DEFAULT_TIMEZONE),
        name_en: meetingLabel(meeting, 'en', city?.timezone ?? DEFAULT_TIMEZONE),
        dateTime: new Date(meeting.dateTime).toISOString(),
    }));

    return (
        <EmbedConfigurator
            cityId={cityId}
            cityName={city?.name}
            cityTimezone={city?.timezone}
            bodyGroups={bodyGroups}
            recentMeetings={recentMeetings}
            lockedBody={lockedBody ? { id: lockedBody.id, name: lockedBody.name, name_en: lockedBody.name_en, type: lockedBody.type } : null}
        />
    );
}
