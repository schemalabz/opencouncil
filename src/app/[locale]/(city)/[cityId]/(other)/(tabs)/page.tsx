import { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUserAuthorizedToEdit } from "@/lib/auth";
import CityMeetings from "@/components/cities/CityMeetings";
import { getCityCached, getCouncilMeetingsForCityCached } from "@/lib/cache";
import { env } from "@/env.mjs";

interface PageProps {
    params: { cityId: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const [city, councilMeetings] = await Promise.all([
        getCityCached(params.cityId),
        getCouncilMeetingsForCityCached(params.cityId)
    ]);

    if (!city) {
        return {
            title: "Δήμος δεν βρέθηκε | OpenCouncil",
            description: "Ο δήμος που ζητάτε δεν βρέθηκε ή δεν είναι διαθέσιμος στο OpenCouncil.",
        };
    }

    const meetingsCount = councilMeetings.length;
    const releasedMeetings = councilMeetings.filter(meeting => meeting.released);
    const description = meetingsCount > 0
        ? `Δείτε ${releasedMeetings.length} δημοσιευμένες συνεδριάσεις του ${city.name}. Παρακολουθήστε τα δημοτικά συμβούλια, διαβάστε πρακτικά και ενημερωθείτε για τις αποφάσεις που επηρεάζουν την πόλη σας.`
        : `Ο ${city.name} είναι μέλος του δικτύου OpenCouncil. Ελέγχετε ξανά σύντομα για νέες συνεδριάσεις και πρακτικά.`;

    return {
        title: `${city.name} - Δημοτικά Συμβούλια | OpenCouncil`,
        description,
        keywords: [
            city.name,
            'δημοτικό συμβούλιο',
            'συνεδριάσεις',
            'πρακτικά',
            'αποφάσεις',
            'τοπική αυτοδιοίκηση',
            'διαφάνεια',
            'δημόσια διοίκηση',
            'δημότες',
            ...(city.region ? [city.region] : []),
        ],
        openGraph: {
            title: `${city.name} - Δημοτικά Συμβούλια`,
            description,
            type: 'website',
            url: `${env.NEXT_PUBLIC_BASE_URL}/${params.cityId}`,
            images: [
                {
                    url: `/api/og?cityId=${params.cityId}`,
                    width: 1200,
                    height: 630,
                    alt: `${city.name} δημοτικό συμβούλιο`,
                }
            ],
            siteName: 'OpenCouncil',
            locale: 'el_GR',
        },
        twitter: {
            card: 'summary_large_image',
            title: `${city.name} - Δημοτικά Συμβούλια`,
            description,
            images: [`/api/og?cityId=${params.cityId}`],
        },
        alternates: {
            canonical: `/${params.cityId}`,
            languages: {
                'el': `/${params.cityId}`,
                'en': `/en/${params.cityId}`,
            },
        },
        other: {
            'city:name': city.name,
            'city:meetings:count': meetingsCount.toString(),
            'city:meetings:released': releasedMeetings.length.toString(),
            'city:region': city.region || '',
        }
    };
}

export default async function MeetingsPage({
    params: { cityId }
}: {
    params: { cityId: string }
}) {
    const [city, councilMeetings] = await Promise.all([
        getCityCached(cityId),
        getCouncilMeetingsForCityCached(cityId)
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
        />
    );
} 