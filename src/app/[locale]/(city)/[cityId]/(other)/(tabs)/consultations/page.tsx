import { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityConsultations from "@/components/cities/CityConsultations";
import { getCityCached } from "@/lib/cache";
import { getAllConsultationsForCity, isConsultationActive } from "@/lib/db/consultations";
import { withCanonicalUrl } from '@/lib/utils/hreflang';
import { getLocalizedName, getMunicipalityQualifier } from "@/lib/formatters/name";
import { authorityKey } from "@/lib/utils/authority";
import { getOgLocale } from '@/i18n/config';
import { getTranslations } from 'next-intl/server';
import { buildOgImageUrl } from '@/lib/og/locale';

interface PageProps {
    params: Promise<{ cityId: string; locale: string }>;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
    const params = await props.params;
    const [city, consultations, t] = await Promise.all([
        getCityCached(params.cityId),
        getAllConsultationsForCity(params.cityId),
        getTranslations({ locale: params.locale, namespace: 'metadata.consultations' }),
    ]);

    if (!city) {
        return {
            title: t('notFoundTitle'),
            description: t('notFoundDescription'),
        };
    }

    // Count active consultations using timezone-aware calculation
    const activeConsultationsCount = consultations.filter(consultation =>
        isConsultationActive(consultation, consultation.city.timezone)
    ).length;

    const totalConsultationsCount = consultations.length;

    const cityName = getLocalizedName(city, params.locale);
    const names = { cityName, qualifier: getMunicipalityQualifier(city, params.locale) };
    const counts = { activeCount: activeConsultationsCount, totalCount: totalConsultationsCount };
    const description = totalConsultationsCount > 0
        ? activeConsultationsCount > 0
            ? t(authorityKey('descriptionActive', city), { ...names, ...counts })
            : t(authorityKey('descriptionPast', city), { ...names, ...counts })
        : t(authorityKey('descriptionNone', city), names);
    const shortTitle = t('shortTitle', { cityName });

    // Generate OG image URL for city
    const ogImageUrl = buildOgImageUrl(params.locale, { cityId: params.cityId });

    return withCanonicalUrl(`/${params.cityId}/consultations`, {
        title: t('title', { cityName }),
        description,
        keywords: [
            ...(t.raw('keywords') as string[]),
            cityName,
            'OpenCouncil',
            ...(activeConsultationsCount > 0 ? [t('keywordActive')] : []),
            ...(totalConsultationsCount > activeConsultationsCount ? [t('keywordPast')] : [])
        ],
        authors: [{ name: t(authorityKey('author', city), names) }],
        openGraph: {
            title: shortTitle,
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
            title: shortTitle,
            description,
            images: [ogImageUrl],
        },
        other: {
            'consultations:total': totalConsultationsCount.toString(),
            'consultations:active': activeConsultationsCount.toString(),
            'consultations:city': city.name,
            'consultations:enabled': (city as any).consultationsEnabled.toString(),
        }
    });
}

export default async function ConsultationsPage(
    props: {
        params: Promise<{ cityId: string }>
    }
) {
    const params = await props.params;

    const {
        cityId
    } = params;

    const [city, consultations] = await Promise.all([
        getCityCached(cityId),
        getAllConsultationsForCity(cityId)
    ]);

    if (!city) {
        notFound();
    }

    // Check if consultations are enabled for this city
    if (!(city as any).consultationsEnabled) {
        notFound();
    }

    const canEdit = await isUserAuthorizedToEdit({ cityId });

    return (
        <CityConsultations
            consultations={consultations}
            cityId={cityId}
            canEdit={canEdit}
        />
    );
} 