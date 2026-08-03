import { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityConsultations from "@/components/cities/CityConsultations";
import { getCityCached } from "@/lib/cache";
import { getAllConsultationsForCity, isConsultationActive } from "@/lib/db/consultations";
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';
import { getLocalizedName } from "@/lib/formatters/name";
import { getOgLocale } from '@/i18n/config';

interface PageProps {
    params: Promise<{ cityId: string; locale: string }>;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
    const params = await props.params;
    const [city, consultations] = await Promise.all([
        getCityCached(params.cityId),
        getAllConsultationsForCity(params.cityId)
    ]);

    if (!city) {
        return {
            title: "Διαβουλεύσεις δεν βρέθηκαν | OpenCouncil",
            description: "Ο δήμος που ζητάτε δεν βρέθηκε ή δεν έχει διαβουλεύσεις.",
        };
    }

    // Count active consultations using timezone-aware calculation
    const activeConsultationsCount = consultations.filter(consultation =>
        isConsultationActive(consultation, consultation.city.timezone)
    ).length;

    const totalConsultationsCount = consultations.length;

    const cityName = getLocalizedName(city, params.locale);
    const description = totalConsultationsCount > 0
        ? activeConsultationsCount > 0
            ? `Δείτε και συμμετέχετε σε ${activeConsultationsCount} ${activeConsultationsCount === 1 ? 'ενεργή διαβούλευση' : 'ενεργές διαβουλεύσεις'} από συνολικά ${totalConsultationsCount} στον Δήμο ${cityName}. Εκφράστε τη γνώμη σας για τους νέους κανονισμούς και τις πολιτικές που επηρεάζουν την πόλη σας.`
            : `Δείτε ${totalConsultationsCount} ${totalConsultationsCount === 1 ? 'παλαιότερη διαβούλευση' : 'παλαιότερες διαβουλεύσεις'} στον Δήμο ${cityName}. Δεν υπάρχουν ενεργές διαβουλεύσεις αυτή τη στιγμή.`
        : `Δεν υπάρχουν διαβουλεύσεις στον Δήμο ${cityName} αυτή τη στιγμή. Ελέγχετε ξανά σύντομα για νέες ευκαιρίες συμμετοχής.`;

    // Generate OG image URL for city
    const ogImageUrl = `/api/og?cityId=${params.cityId}`;

    return {
        title: `Δημόσιες Διαβουλεύσεις | ${cityName} | OpenCouncil`,
        description,
        keywords: [
            'διαβουλεύσεις',
            'δημόσιες διαβουλεύσεις',
            'συμμετοχικός σχεδιασμός',
            'τοπική αυτοδιοίκηση',
            'κανονισμοί',
            cityName,
            'OpenCouncil',
            ...(activeConsultationsCount > 0 ? ['ενεργές διαβουλεύσεις'] : []),
            ...(totalConsultationsCount > activeConsultationsCount ? ['παλαιότερες διαβουλεύσεις'] : [])
        ],
        authors: [{ name: `Δήμος ${cityName}` }],
        openGraph: {
            title: `Δημόσιες Διαβουλεύσεις | ${cityName}`,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `Δημόσιες διαβουλεύσεις | ${cityName}`,
                }
            ],
            locale: getOgLocale(params.locale),
        },
        twitter: {
            card: 'summary_large_image',
            title: `Δημόσιες Διαβουλεύσεις | ${cityName}`,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildCanonicalAlternates(`/${params.cityId}/consultations`),
        other: {
            'consultations:total': totalConsultationsCount.toString(),
            'consultations:active': activeConsultationsCount.toString(),
            'consultations:city': city.name,
            'consultations:enabled': (city as any).consultationsEnabled.toString(),
        }
    };
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