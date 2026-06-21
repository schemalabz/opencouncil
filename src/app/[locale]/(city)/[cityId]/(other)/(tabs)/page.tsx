import { notFound } from "next/navigation";
import { Metadata } from "next";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getCityCached, getCouncilMeetingsForCityCached } from "@/lib/cache";
import { buildHreflangAlternates } from "@/lib/utils/hreflang";

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

    if (!city) {
        return {
            title: "Δήμος δεν βρέθηκε | OpenCouncil",
            description: "Ο δήμος που αναζητάτε δεν είναι διαθέσιμος.",
            alternates: await buildHreflangAlternates(`/${cityId}`, locale),
        };
    }

    const description = `Συνεδριάσεις του Δήμου ${city.name}: βίντεο, απομαγνητοφωνήσεις, θέματα ημερήσιας διάταξης και αποφάσεις, εξηγημένα απλά.`;
    const ogImageUrl = `/api/og?cityId=${cityId}`;

    return {
        title: `${city.name} | OpenCouncil`,
        description,
        keywords: [
            city.name,
            "δημοτικό συμβούλιο",
            "συνεδριάσεις",
            "τοπική αυτοδιοίκηση",
            "OpenCouncil",
        ],
        authors: [{ name: `Δήμος ${city.name}` }],
        openGraph: {
            title: `${city.name} | OpenCouncil`,
            description,
            type: "website",
            siteName: "OpenCouncil",
            images: [
                {
                    url: ogImageUrl,
                    width: 1200,
                    height: 630,
                    alt: `OpenCouncil — Συνεδριάσεις του Δήμου ${city.name}`,
                },
            ],
            locale: locale === "en" ? "en_US" : "el_GR",
        },
        twitter: {
            card: "summary_large_image",
            title: `${city.name} | OpenCouncil`,
            description,
            images: [ogImageUrl],
        },
        alternates: await buildHreflangAlternates(`/${cityId}`, locale),
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