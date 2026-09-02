import type { City, CityMessage as CityMessageType } from '@prisma/client';
import type { CityWithCounts } from '@/lib/db/cities';
import type { CityNotificationPreference } from '@/lib/db/notifications';
import { CityAdminTools } from '@/components/cities/CityAdminTools';
import { CityMeetingsModule, type MeetingBookends } from '@/components/cities/overview/CityMeetingsModule';
import { CityNotificationCard } from '@/components/cities/overview/CityNotificationCard';
import { CityPetitionCard } from '@/components/cities/overview/CityPetitionCard';
import type { PetitionBucket } from '@/lib/landing/petitions';

interface CityRailProps {
    city: CityWithCounts;
    cityMessage: CityMessageType | null;
    canEdit: boolean;
    isSuperAdmin: boolean;
    hasNoData: boolean;
    notificationPreference: CityNotificationPreference | null;
    /** The public "N+" bucket of the city's petitions, for a city not covered yet. */
    petitionBucket: PetitionBucket | null;
    allMeetings: MeetingBookends;
    councilMeetings: MeetingBookends;
    locale: string;
}

/**
 * The city's standing column: when it last met, how to hear about it next, and
 * the operator's tools.
 *
 * These are facts about the municipality rather than about the tab in front of
 * you, so they stay put while the tabs change beneath them — and, on a wide
 * screen, while the tab's own content scrolls past. They used to sit in
 * a band above the tabs, which meant the page could not start until the tallest
 * of them had finished — two cards there ran twice as tall as the identity
 * beside them and left a hole the width of the page.
 */
export function CityRail({
    city,
    cityMessage,
    canEdit,
    isSuperAdmin,
    hasNoData,
    notificationPreference,
    petitionBucket,
    allMeetings,
    councilMeetings,
    locale,
}: CityRailProps) {
    return (
        // Sticky below lg is pointless — the rail is above the tabs there, not
        // beside them. top-24 clears the sticky header; the max-height keeps a
        // rail taller than the window reachable instead of pinning its top and
        // cutting off everything under the fold.
        <aside className="flex flex-col gap-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
            {/* Operator controls sit above everything a citizen is here for. */}
            <CityAdminTools
                city={city as City}
                cityMessage={cityMessage}
                canEdit={canEdit}
                isSuperAdmin={isSuperAdmin}
                hasNoData={hasNoData}
            />
            <CityMeetingsModule
                all={allMeetings}
                council={councilMeetings}
                cityId={city.id}
                timezone={city.timezone}
                locale={locale}
            />
            <CityNotificationCard city={city} preference={notificationPreference} locale={locale} />
            <CityPetitionCard city={city} bucket={petitionBucket} locale={locale} />
        </aside>
    );
}
