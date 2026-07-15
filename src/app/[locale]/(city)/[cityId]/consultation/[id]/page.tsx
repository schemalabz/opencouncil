import { Metadata } from "next";
import { getCityCached } from "@/lib/cache";
import { getConsultationById, getConsultationComments, fetchRegulationData } from "@/lib/db/consultations";
import { notFound } from "next/navigation";
import { ConsultationViewer } from "@/components/consultations";
import { auth } from "@/auth";
import { Suspense } from "react";
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';
import { getRealmBaseUrlFromRequest } from '@/lib/realm.server';

interface PageProps {
    params: Promise<{ cityId: string; id: string; locale: string }>;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
    const params = await props.params;
    const [consultation, city] = await Promise.all([
        getConsultationById(params.cityId, params.id),
        getCityCached(params.cityId)
    ]);

    if (!consultation || !city) {
        return {
            title: "Η διαβούλευση δεν βρέθηκε | OpenCouncil",
            description: "Η διαβούλευση που ζητάτε δεν βρέθηκε ή δεν είναι διαθέσιμη.",
        };
    }

    // Fetch regulation data for enhanced metadata
    const regulationData = await fetchRegulationData(consultation.jsonUrl);

    // Calculate basic statistics
    const chaptersCount = regulationData?.regulation?.filter(item => item.type === 'chapter').length || 0;
    const geosetsCount = regulationData?.regulation?.filter(item => item.type === 'geoset').length || 0;

    // Format end date
    const endDate = new Date(consultation.endDate);
    const isActive = consultation.isActive && endDate > new Date();
    const statusText = isActive ? 'ενεργή' : 'έχει λήξει';

    // Generate rich description
    const title = regulationData?.title || consultation.name;
    const description = `${isActive ? 'Ενεργή δημόσια διαβούλευση' : 'Δημόσια διαβούλευση που έχει λήξει'} για "${title}" στον Δήμο ${city.name}. ${chaptersCount > 0 ? `Περιλαμβάνει ${chaptersCount} κεφάλαια${geosetsCount > 0 ? ` και ${geosetsCount} γεωγραφικές περιοχές` : ''}.` : ''} Μάθετε περισσότερα και συμμετέχετε στη διαβούλευση.`;

    // Generate OG image URL
    const ogImageUrl = `/api/og?cityId=${params.cityId}&consultationId=${params.id}`;

    return {
        title: `${title} | ${city.name} | OpenCouncil`,
        description,
        keywords: [
            'διαβούλευση',
            'δημόσια διαβούλευση',
            'κανονισμός',
            'τοπική αυτοδιοίκηση',
            city.name,
            'OpenCouncil',
            ...(isActive ? ['ενεργή διαβούλευση'] : ['παλαιότερη διαβούλευση'])
        ],
        authors: [{ name: `Δήμος ${city.name}` }],
        openGraph: {
            title: `${title} | ${city.name}`,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `Διαβούλευση για ${title} στον Δήμο ${city.name}`,
                }
            ],
            locale: 'el_GR',
        },
        twitter: {
            card: 'summary_large_image',
            title: `${title} | ${city.name}`,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildCanonicalAlternates(`/${params.cityId}/consultation/${params.id}`),
        other: {
            'consultation:status': isActive ? 'active' : 'expired',
            'consultation:endDate': consultation.endDate.toISOString(),
            'consultation:city': city.name,
            'consultation:chaptersCount': chaptersCount.toString(),
            'consultation:geosetsCount': geosetsCount.toString(),
        }
    };
}

export default async function ConsultationPage(props: PageProps) {
    const params = await props.params;
    const [city, consultation, session] = await Promise.all([
        getCityCached(params.cityId),
        getConsultationById(params.cityId, params.id),
        auth()
    ]);

    if (!city) {
        notFound();
    }

    // Check if consultations are enabled for this city
    if (!city.consultationsEnabled) {
        notFound();
    }

    if (!consultation) {
        console.error(`Consultation not found: ${params.id}`);
        notFound();
    }

    // Fetch regulation data and comments in parallel
    const [regulationData, comments] = await Promise.all([
        fetchRegulationData(consultation.jsonUrl),
        getConsultationComments(params.id, params.cityId, session)
    ]);

    // Base URL for permalinks — the realm's canonical domain (per request Host)
    const realmBaseUrl = await getRealmBaseUrlFromRequest();
    const baseUrl = `/${params.cityId}/consultation/${params.id}`;
    const consultationUrl = new URL(baseUrl, realmBaseUrl);
    const cityUrl = new URL(`/${params.cityId}`, realmBaseUrl);


    // Generate structured data for SEO
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "GovernmentPermit",
        "name": regulationData?.title || consultation.name,
        "description": `Δημόσια διαβούλευση για ${regulationData?.title || consultation.name} στον Δήμο ${city.name}`,
        "url": consultationUrl.toString(),
        "issuedBy": {
            "@type": "GovernmentOrganization",
            "name": `Δήμος ${city.name}`,
            "url": cityUrl.toString()
        },
        "validFrom": consultation.createdAt.toISOString(),
        "validThrough": consultation.endDate.toISOString(),
        "permitAudience": {
            "@type": "Audience",
            "audienceType": "Δημότες",
            "geographicArea": {
                "@type": "City",
                "name": city.name
            }
        }
    };

    return (
        <>
            {/* Structured Data for SEO */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(structuredData),
                }}
            />
            <Suspense fallback={null}>
                <ConsultationViewer
                    consultation={consultation}
                    regulationData={regulationData}
                    baseUrl={baseUrl}
                    comments={comments}
                    currentUser={session?.user}
                    consultationId={params.id}
                    cityId={params.cityId}
                    cityName={city.name}
                    cityLogoUrl={city.logoImage || null}
                />
            </Suspense>
        </>
    );
} 