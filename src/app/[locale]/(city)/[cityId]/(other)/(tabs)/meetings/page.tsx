import { notFound } from "next/navigation";
import { Metadata } from "next";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getCityCached, getCouncilMeetingsPreviewCached } from "@/lib/cache";
import { buildCanonicalAlternates } from "@/lib/utils/hreflang";
import { getLocalizedName } from "@/lib/formatters/name";
import { getOgLocale } from '@/i18n/config';
import { getTranslations } from 'next-intl/server';
import { buildOgImageUrl } from '@/lib/og/locale';

export async function generateMetadata(
    props: {
        params: Promise<{ cityId: string; locale: string }>
    }
): Promise<Metadata> {
    const params = await props.params;

    const {
        cityId,
        locale
    } = params;

    const city = await getCityCached(cityId);
    const t = await getTranslations({ locale, namespace: 'metadata.meetings' });

    if (!city) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
            alternates: await buildCanonicalAlternates(`/${cityId}/meetings`),
        };
    }

    const cityName = getLocalizedName(city, locale);
    const title = t('title', { cityName });
    const description = t('description', { cityName, meetingsCount: city._count.councilMeetings });
    const ogImageUrl = buildOgImageUrl(locale, { cityId });

    return {
        title,
        description,
        keywords: [cityName, ...(t.raw('keywords') as string[]), "OpenCouncil"],
        authors: [{ name: t('author', { cityName }) }],
        openGraph: {
            title,
            description,
            type: "website",
            siteName: "OpenCouncil",
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: t('ogAlt', { cityName }),
                },
            ],
            locale: getOgLocale(locale),
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildCanonicalAlternates(`/${cityId}/meetings`),
    };
}

const MEETINGS_PAGE_SIZE = 12;

/**
 * How many meetings the tab loads.
 *
 * The list filters, searches and pages in the browser, so every row a reader
 * can reach without a reload has to be in the payload. A card carries its
 * meeting's whole agenda, which put a large city's archive — 124 meetings,
 * 1.28 MB — on the wire to draw twelve cards. This bounds that at a constant,
 * and leaves the filter and the search whole over what it covers, which paging
 * the query would not: both run over the loaded rows.
 *
 * Meetings past the window stay reachable through the page header's search and
 * through their own URLs.
 */
const MEETINGS_TAB_LIMIT = MEETINGS_PAGE_SIZE * 5;

export default async function MeetingsPage(
    props: {
        params: Promise<{ cityId: string }>;
    }
) {
    const params = await props.params;

    const {
        cityId
    } = params;

    const [city, councilMeetings, canEdit] = await Promise.all([
        getCityCached(cityId),
        getCouncilMeetingsPreviewCached(cityId, { limit: MEETINGS_TAB_LIMIT }),
        isUserAuthorizedToEdit({ cityId }),
    ]);

    if (!city) {
        notFound();
    }

    return (
        <CityMeetings
            councilMeetings={councilMeetings}
            cityId={cityId}
            timezone={city.timezone}
            canEdit={canEdit}
            pageSize={MEETINGS_PAGE_SIZE}
        />
    );
}
