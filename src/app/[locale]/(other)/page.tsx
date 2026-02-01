import { Landing } from "@/components/landing/landing";
import { LandingCity } from "@/lib/db/landing";
import { fetchLatestSubstackPostCached, getAllCitiesMinimalCached, getCouncilMeetingsForCityPublicCached } from "@/lib/cache/queries";

export default async function HomePage({
    params: { locale }
}: {
    params: { locale: string }
}) {
    // Fetch all cities (minimal data) and substack post in parallel
    const [allCities, latestPost] = await Promise.all([
        getAllCitiesMinimalCached().catch(error => {
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