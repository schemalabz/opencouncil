import { notFound } from "next/navigation";
import { getCurrentUser, getRoleLimitForCity } from "@/lib/auth";
import { ALL_SCOPE, isSecondaryBody, readTier, tabTier } from "@/lib/utils/bodyTier";
import CityPeople from "@/components/cities/CityPeople";
import { countPeopleOfCityCached, getPartiesForCityCached, getPublicAdministrativeBodiesForCityCached, getCityCached, listPeopleOfCityCached } from "@/lib/cache";
import { Metadata } from "next";
import { withCanonicalUrl } from '@/lib/utils/hreflang';
import { getLocalizedName } from "@/lib/formatters/name";
import { getOgLocale } from '@/i18n/config';
import { getTranslations } from 'next-intl/server';
import { buildOgImageUrl } from '@/lib/og/locale';

export async function generateMetadata(props: { params: Promise<{ cityId: string; locale: string }> }): Promise<Metadata> {
    const params = await props.params;
    const t = await getTranslations({ locale: params.locale, namespace: 'metadata.people' });
    const [city, parties] = await Promise.all([
        getCityCached(params.cityId),
        getPartiesForCityCached(params.cityId)
    ]);

    if (!city) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
        };
    }

    // The roster the page opens on, as the identity band counts it.
    const peopleCount = city._count.persons;
    const partiesCount = parties?.length || 0;

    // Generate rich description
    const cityName = getLocalizedName(city, params.locale);
    const description = t('description', { cityName, peopleCount, partiesCount });

    // Generate OG image URL
    const ogImageUrl = buildOgImageUrl(params.locale, { cityId: params.cityId, pageType: 'people' });

    return withCanonicalUrl(`/${params.cityId}/people`, {
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
        other: {
            'people:count': peopleCount.toString(),
            'people:parties': partiesCount.toString(),
            'people:city': city.name,
        }
    });
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

    const [city, partiesWithPersons, administrativeBodies, secondaryCount, roleLimit, currentUser] = await Promise.all([
        getCityCached(cityId),
        getPartiesForCityCached(cityId),
        getPublicAdministrativeBodiesForCityCached(cityId),
        countPeopleOfCityCached(cityId, { tier: 'secondary' }),
        // null for a city admin; the bodies of a body admin; empty for a reader
        getRoleLimitForCity(cityId),
        // Only a superadmin gets the elected order control, as on /admin/people
        // before it moved here. This gates the control, not the write: the save
        // route accepts anyone who may edit the city. Read from the user, the
        // way the tabs layout above does, rather than through the edit check.
        getCurrentUser()
    ]);
    if (!city || !partiesWithPersons) {
        notFound();
    }

    const canEdit = roleLimit === null || roleLimit.size > 0;
    // The server reads the tier, so the browser gets the people on show only.
    const secondaryAvailable = secondaryCount > 0;
    const tier = tabTier({
        requested: readTier(search.tier),
        secondaryAvailable,
        administersSecondary: roleLimit !== null && administrativeBodies.some(body => roleLimit.has(body.id) && isSecondaryBody(body)),
        primaryEmpty: city._count.persons === 0,
    });
    // The superadmin tools order every member of a body, whatever the tier on
    // show. The same cache entry serves both when the tab shows every tier.
    const [people, superAdminRoster] = await Promise.all([
        listPeopleOfCityCached(cityId, { tier }),
        currentUser?.isSuperAdmin ? listPeopleOfCityCached(cityId, ALL_SCOPE) : null,
    ]);

    return (
        <CityPeople
            people={people}
            partiesWithPersons={partiesWithPersons}
            administrativeBodies={administrativeBodies}
            cityId={cityId}
            cityLanguage={city.language}
            canEdit={canEdit}
            superAdminRoster={superAdminRoster}
            editableBodyIds={roleLimit ? [...roleLimit] : undefined}
            secondaryTier={{ available: secondaryAvailable, shown: tier !== 'primary' }}
        />
    );
} 