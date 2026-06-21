import { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { LandingCity } from "@/lib/db/landing";
import { fetchLatestSubstackPostCached, getAllCitiesMinimalCached, getCouncilMeetingsForCityPublicCached } from "@/lib/cache/queries";
import { buildHreflangAlternates } from "@/lib/utils/hreflang";
import { getRealm } from "@/lib/realm.server";

export async function generateMetadata(
    props: {
        params: Promise<{ locale: string }>
    }
): Promise<Metadata> {
    const params = await props.params;

    const {
        locale
    } = params;

    return {
        alternates: await buildHreflangAlternates('', locale),
    };
}

export default async function HomePage(
    props: {
        params: Promise<{ locale: string }>
    }
) {
    const params = await props.params;

    const {
        locale
    } = params;

    // Fetch all cities (minimal data) and substack post in parallel
    const realm = await getRealm();
    const [allCities, latestPost] = await Promise.all([
        getAllCitiesMinimalCached(realm).catch(error => {
            console.error('Failed to fetch cities:', error);
            return [];
        }),
        fetchLatestSubstackPostCached()
    ]);

    // Only fetch meeting information for listed cities with official support
    const supportedCities = allCities.filter(city => city.officialSupport && city.status === 'listed');

    // Fetch most recent meeting for supported cities in parallel to create citiesWithMeetings
    const citiesWithMeetings: LandingCity[] = await Promise.all(
        supportedCities.map(async city => {
            const meetings = await getCouncilMeetingsForCityPublicCached(city.id, { limit: 1 });
            
            return {
                ...city,
                mostRecentMeeting: meetings[0]
            };
        })
    );


    return <Landing allCities={allCities} cities={citiesWithMeetings} latestPost={latestPost} />;
} 