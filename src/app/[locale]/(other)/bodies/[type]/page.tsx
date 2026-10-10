import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AdministrativeBodyType } from '@prisma/client';
import { BodyDirectory, type DirectoryUpcomingMeeting } from '@/components/bodies/BodyDirectory';
import { getOgLocale } from '@/i18n/config';
import { getBodyDirectoryCached } from '@/lib/cache/queries';
import { getUpcomingMeetingsCached } from '@/lib/db/meetings';
import { getHotSubjectsCached } from '@/lib/db/subject';
import { meetingLabel } from '@/lib/meetingName';
import { buildOgImageUrl } from '@/lib/og/locale';
import { bodyDirectoryPath } from '@/lib/realm';
import { getRealm } from '@/lib/realm.server';
import { toAdministrativeBodyType } from '@/lib/utils/administrativeBodies';
import { isSecondaryBody } from '@/lib/utils/bodyTier';
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';

type Params = { params: Promise<{ locale: string; type: string }> };

/** The most discussed subjects of the type: a year back, so a recess never empties the list. */
const HOT_SUBJECTS_MONTHS = 12;
const HOT_SUBJECTS_LIMIT = 12;
const UPCOMING_LIMIT = 6;

/**
 * The type a directory exists for: a secondary one (#829). The content of
 * the primary tier is the realm's landing, which needs no second door.
 */
function directoryType(param: string): AdministrativeBodyType | null {
    const type = toAdministrativeBodyType(param);
    return type && isSecondaryBody({ type }) ? type : null;
}

export async function generateMetadata(props: Params): Promise<Metadata> {
    const { locale, type: param } = await props.params;
    const type = directoryType(param);
    if (!type) return { title: 'OpenCouncil' };
    const t = await getTranslations({ locale, namespace: 'bodyDirectory' });
    const title = `${t(`${type}.title`)} | OpenCouncil`;
    const description = t(`${type}.metaDescription`);
    const ogImageUrl = buildOgImageUrl(locale, { pageType: 'landing' });
    return {
        title,
        description,
        openGraph: {
            title,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            locale: getOgLocale(locale),
            images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
        },
        twitter: { card: 'summary_large_image', title, description, images: [ogImageUrl] },
        alternates: await buildCanonicalAlternates(bodyDirectoryPath(type)),
    };
}

/**
 * The directory of a secondary body type (#829): the bodies of the type
 * across the realm, their most discussed subjects, and their next meetings.
 * youth.opencouncil.gr opens on the youth councils' directory (see
 * `BODY_TYPE_HOSTS`).
 */
export default async function BodyDirectoryPage(props: Params) {
    const { locale, type: param } = await props.params;
    const type = directoryType(param);
    if (!type) notFound();

    const realm = await getRealm();
    const [bodies, hotSubjects, upcomingRows] = await Promise.all([
        getBodyDirectoryCached(realm, type),
        getHotSubjectsCached(realm, { monthsBack: HOT_SUBJECTS_MONTHS, bodyTypes: [type] }, HOT_SUBJECTS_LIMIT),
        getUpcomingMeetingsCached(realm, { limit: UPCOMING_LIMIT, bodyTypes: [type] }),
    ]);

    // The wire shape of a row that crossed a cache: a date arrives as text.
    const upcoming: DirectoryUpcomingMeeting[] = upcomingRows.map(meeting => ({
        id: meeting.id,
        cityId: meeting.cityId,
        cityName: meeting.city.name,
        name: meetingLabel(meeting, locale, meeting.city.timezone),
        dateTime: new Date(meeting.dateTime).toISOString(),
        timezone: meeting.city.timezone,
    }));

    return <BodyDirectory type={type} bodies={bodies} hotSubjects={hotSubjects} upcoming={upcoming} locale={locale} />;
}
