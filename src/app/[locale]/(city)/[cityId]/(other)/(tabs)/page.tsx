import { notFound } from "next/navigation";
import { Metadata } from "next";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getCityCached, getCouncilMeetingsForCityCached } from "@/lib/cache";
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
    const t = await getTranslations({ locale, namespace: 'metadata.city' });

    if (!city) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
            alternates: await buildCanonicalAlternates(`/${cityId}`),
        };
    }

    const cityName = getLocalizedName(city, locale);
    const description = t('description', { cityName });
    const ogImageUrl = buildOgImageUrl(locale, { cityId });

    return {
        title: `${cityName} | OpenCouncil`,
        description,
        keywords: [cityName, ...(t.raw('keywords') as string[]), "OpenCouncil"],
        authors: [{ name: t('author', { cityName }) }],
        openGraph: {
            title: `${cityName} | OpenCouncil`,
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
            title: `${cityName} | OpenCouncil`,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildCanonicalAlternates(`/${cityId}`),
    };
}

export default async function MeetingsPage(
    props: {
        params: Promise<{ cityId: string }>;
        searchParams: Promise<{ page?: string }>;
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;

    const {
        cityId
    } = params;

    const pageNumber = parseInt(searchParams.page || '1', 10);
    const currentPage = isNaN(pageNumber) || pageNumber < 1 ? 1 : pageNumber;
    const pageSize = 12;

    const [city, councilMeetings] = await Promise.all([
        getCityCached(cityId),
        getCouncilMeetingsForCityCached(cityId, {}),
    ]);

    if (!city) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityMeetings
            councilMeetings={councilMeetings}
            cityId={cityId}
            timezone={city.timezone}
            canEdit={canEdit}
            currentPage={currentPage}
            pageSize={pageSize}
        />
    );
} 