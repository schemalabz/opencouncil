import { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityConsultations from "@/components/cities/CityConsultations";
import { getCityCached } from "@/lib/cache";
import { getConsultationsForCity } from "@/lib/db/consultations";

interface PageProps {
    params: { cityId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const [city, consultations] = await Promise.all([
        getCityCached(params.cityId),
        getConsultationsForCity(params.cityId)
    ]);

    if (!city) {
        return {
            title: "Διαβουλεύσεις δεν βρέθηκαν | OpenCouncil",
            description: "Ο δήμος που ζητάτε δεν βρέθηκε ή δεν έχει ενεργές διαβουλεύσεις.",
        };
    }

    const activeConsultationsCount = consultations.length;
    const description = activeConsultationsCount > 0
        ? `Δείτε και συμμετέχετε σε ${activeConsultationsCount} ${activeConsultationsCount === 1 ? 'ενεργή διαβούλευση' : 'ενεργές διαβουλεύσεις'} στον Δήμο ${city.name}. Εκφράστε τη γνώμη σας για τους νέους κανονισμούς και τις πολιτικές που επηρεάζουν την πόλη σας.`
        : `Δεν υπάρχουν ενεργές διαβουλεύσεις στον Δήμο ${city.name} αυτή τη στιγμή. Ελέγχετε ξανά σύντομα για νέες ευκαιρίες συμμετοχής.`;

    // Generate OG image URL for city
    const ogImageUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/og?cityId=${params.cityId}`;

    return {
        title: `Δημόσιες Διαβουλεύσεις | ${city.name} | OpenCouncil`,
        description,
        keywords: [
            'διαβουλεύσεις',
            'δημόσιες διαβουλεύσεις',
            'συμμετοχικός σχεδιασμός',
            'τοπική αυτοδιοίκηση',
            'κανονισμοί',
            city.name,
            'OpenCouncil',
            ...(activeConsultationsCount > 0 ? ['ενεργές διαβουλεύσεις'] : ['μελλοντικές διαβουλεύσεις'])
        ],
        authors: [{ name: `Δήμος ${city.name}` }],
        openGraph: {
            title: `Δημόσιες Διαβουλεύσεις | ${city.name}`,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `Δημόσιες διαβουλεύσεις στον Δήμο ${city.name}`,
                }
            ],
            locale: 'el_GR',
        },
        twitter: {
            card: 'summary_large_image',
            title: `Δημόσιες Διαβουλεύσεις | ${city.name}`,
            description,
            images: [ogImageUrl],
        },
        alternates: {
            canonical: `/${params.cityId}/consultations`,
        },
        other: {
            'consultations:count': activeConsultationsCount.toString(),
            'consultations:city': city.name,
            'consultations:enabled': (city as any).consultationsEnabled.toString(),
        }
    };
}

export default async function ConsultationsPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const [city, consultations] = await Promise.all([
        getCityCached(cityId),
        getConsultationsForCity(cityId)
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