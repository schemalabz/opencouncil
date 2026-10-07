import { notFound } from "next/navigation";
import { getRoleLimitForCity } from "@/lib/auth";
import { isSecondaryBody, readTier } from "@/lib/utils/bodyTier";
import CityPeople from "@/components/cities/CityPeople";
import { getPartiesForCityCached, getPeopleForCityCached, getAdministrativeBodiesForCityCached, getCityCached } from "@/lib/cache";
import { Metadata } from "next";
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';
import { getLocalizedName } from "@/lib/formatters/name";
import { getOgLocale } from '@/i18n/config';
import { getTranslations } from 'next-intl/server';
import { buildOgImageUrl } from '@/lib/og/locale';

export async function generateMetadata(props: { params: Promise<{ cityId: string; locale: string }> }): Promise<Metadata> {
    const params = await props.params;
    const t = await getTranslations({ locale: params.locale, namespace: 'metadata.people' });
    const [city, people, parties] = await Promise.all([
        getCityCached(params.cityId),
        getPeopleForCityCached(params.cityId),
        getPartiesForCityCached(params.cityId)
    ]);

    if (!city) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
        };
    }

    const peopleCount = people?.length || 0;
    const partiesCount = parties?.length || 0;

    // Generate rich description
    const cityName = getLocalizedName(city, params.locale);
    const description = t('description', { cityName, peopleCount, partiesCount });

    // Generate OG image URL
    const ogImageUrl = buildOgImageUrl(params.locale, { cityId: params.cityId, pageType: 'people' });

    return {
        title: t('title', { cityName }),
        description,
        keywords: [...(t.raw('keywords') as string[]), cityName, 'OpenCouncil'],
        authors: [{ name: t('author', { cityName }) }],
        openGraph: {
            title: t('shortTitle', { cityName }),
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: t('ogAlt', { cityName }),
                }
            ],
            locale: getOgLocale(params.locale),
        },
        twitter: {
            card: 'summary_large_image',
            title: t('shortTitle', { cityName }),
            description,
            images: [ogImageUrl],
        },
        alternates: await buildCanonicalAlternates(`/${params.cityId}/people`),
        other: {
            'people:count': peopleCount.toString(),
            'people:parties': partiesCount.toString(),
            'people:city': city.name,
        }
    };
}

export default async function PeoplePage(
    props: {
        params: Promise<{ cityId: string }>;
        searchParams: Promise<{ tier?: string }>;
    }
) {
    const [params, search] = await Promise.all([props.params, props.searchParams]);

    const {
        cityId
    } = params;

    const [partiesWithPersons, administrativeBodies, allPeople, roleLimit] = await Promise.all([
        getPartiesForCityCached(cityId),
        getAdministrativeBodiesForCityCached(cityId),
        getPeopleForCityCached(cityId),
        // null for a city admin; the bodies of a body admin; empty for a reader
        getRoleLimitForCity(cityId),
    ]);
    const canEdit = roleLimit === null || roleLimit.size > 0;
    // The members of a secondary body show on request, or to whoever
    // administers such a body (#829).
    const showSecondary = readTier(search.tier) === 'all'
        || (roleLimit !== null && administrativeBodies.some(body => roleLimit.has(body.id) && isSecondaryBody(body)));

    if (!partiesWithPersons) {
        notFound();
    }

    return (
        <CityPeople
            allPeople={allPeople}
            partiesWithPersons={partiesWithPersons}
            administrativeBodies={administrativeBodies}
            cityId={cityId}
            canEdit={canEdit}
            editableBodyIds={roleLimit ? [...roleLimit] : undefined}
            showSecondary={showSecondary}
        />
    );
} 