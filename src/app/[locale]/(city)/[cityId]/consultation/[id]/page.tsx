import { Metadata } from "next";
import { getCityCached } from "@/lib/cache";
import { getConsultationById, getConsultationComments, fetchRegulationData } from "@/lib/db/consultations";
import { confirmPendingConsultationComment } from "@/lib/db/consultationComments";
import type { ConfirmedPendingComment, PendingCommentConfirmation } from "@/components/consultations/types";
import { notFound } from "next/navigation";
import { ConsultationViewer } from "@/components/consultations";
import { auth } from "@/auth";
import { Suspense } from "react";
import { buildCanonicalAlternates } from '@/lib/utils/hreflang';
import { getRealm, getRealmBaseUrlFromRequest } from '@/lib/realm.server';
import { getLocalizedName } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';
import { getOgLocale } from '@/i18n/config';
import { buildOgImageUrl } from '@/lib/og/locale';
import Header, { PathElement } from '@/components/layout/Header';
import { hasExplainPage } from '@/lib/explain/availability';

interface PageProps {
    params: Promise<{ cityId: string; id: string; locale: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
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
    const title = localizeText(regulationData?.title || consultation.name, params.locale);
    const cityName = getLocalizedName(city, params.locale);
    const description = `${isActive ? 'Ενεργή δημόσια διαβούλευση' : 'Δημόσια διαβούλευση που έχει λήξει'} για "${title}" στον Δήμο ${cityName}. ${chaptersCount > 0 ? `Περιλαμβάνει ${chaptersCount} κεφάλαια${geosetsCount > 0 ? ` και ${geosetsCount} γεωγραφικές περιοχές` : ''}.` : ''} Μάθετε περισσότερα και συμμετέχετε στη διαβούλευση.`;

    // Generate OG image URL
    const ogImageUrl = buildOgImageUrl(params.locale, { cityId: params.cityId, consultationId: params.id });

    return {
        title: `${title} | ${cityName} | OpenCouncil`,
        description,
        keywords: [
            'διαβούλευση',
            'δημόσια διαβούλευση',
            'κανονισμός',
            'τοπική αυτοδιοίκηση',
            cityName,
            'OpenCouncil',
            ...(isActive ? ['ενεργή διαβούλευση'] : ['παλαιότερη διαβούλευση'])
        ],
        authors: [{ name: `Δήμος ${cityName}` }],
        openGraph: {
            title: `${title} | ${cityName}`,
            description,
            type: 'website',
            siteName: 'OpenCouncil',
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `Διαβούλευση για ${title} στον Δήμο ${cityName}`,
                }
            ],
            locale: getOgLocale(params.locale),
        },
        twitter: {
            card: 'summary_large_image',
            title: `${title} | ${cityName}`,
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

    // A comment's confirmation link lands here with `pending`: opening it publishes that comment,
    // before the comments are read, so the page shows it. Only the signed-in author can.
    const searchParams = await props.searchParams;
    const pendingId = typeof searchParams.pending === 'string' ? searchParams.pending : null;
    const pendingEntityId = typeof searchParams.entity === 'string' ? searchParams.entity : null;
    let pendingResult: PendingCommentConfirmation | null = null;
    if (pendingId) {
        pendingResult = session?.user?.id
            ? await confirmPendingConsultationComment(pendingId, session.user.id)
            : 'not-found';
    }

    // Fetch regulation data and comments in parallel
    const [regulationData, comments] = await Promise.all([
        fetchRegulationData(consultation.jsonUrl),
        getConsultationComments(params.id, params.cityId, session)
    ]);

    // Opened again after it worked (a reload, a second click), the link finds nothing to publish.
    if (pendingResult === 'not-found' && session?.user?.id
        && comments.some(comment => comment.userId === session.user.id && comment.entityId === pendingEntityId)) {
        pendingResult = 'published';
    }
    const pendingConfirmation: ConfirmedPendingComment | null = pendingId && pendingEntityId && pendingResult
        ? { pendingId, entityId: pendingEntityId, result: pendingResult }
        : null;

    // Base URL for permalinks — the realm's canonical domain (per request Host)
    const realmBaseUrl = await getRealmBaseUrlFromRequest();
    const realm = await getRealm();
    const baseUrl = `/${params.cityId}/consultation/${params.id}`;
    const consultationUrl = new URL(baseUrl, realmBaseUrl);
    const cityUrl = new URL(`/${params.cityId}`, realmBaseUrl);


    const pathElements: PathElement[] = [
        { name: getLocalizedName(city, params.locale), link: `/${params.cityId}`, city },
        { name: "Διαβουλεύσεις", link: `/${params.cityId}/consultations` },
        { name: localizeText(consultation.name, params.locale), link: baseUrl },
    ];
    // The header has no ground of its own until the page scrolls, and the consultation's page is grey
    // (on a computer only the panel scrolls, so it never would): give it the site's white. It spans the
    // full width like the map and the consultation bar below it, not the site's centred column.
    const header = <Header path={pathElements} currentEntity={{ cityId: city.id }} showExplain={hasExplainPage(realm)} noContainer className="border-b border-border/60 bg-background" />;

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
                    header={header}
                    pendingConfirmation={pendingConfirmation}
                    realm={realm}
                    consultation={consultation}
                    regulationData={regulationData}
                    comments={comments}
                    currentUser={session?.user}
                    consultationId={params.id}
                    cityId={params.cityId}
                    municipalityName={city.name_municipality}
                    cityLogoUrl={city.logoImage || null}
                />
            </Suspense>
        </>
    );
} 