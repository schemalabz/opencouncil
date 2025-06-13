import { Landing } from "@/components/landing/landing";
import { LandingCity } from "@/lib/db/landing";
import { CityMinimalWithCounts } from "@/lib/db/cities";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { fetchLatestSubstackPostCached } from "@/lib/cache/queries";

export default async function HomePage({
    params: { locale }
}: {
    params: { locale: string }
}) {
    // Fetch all cities (minimal data) and substack post in parallel
    const [allCities, latestPost] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_URL}/api/cities/all`, {
            next: { tags: ['cities:all'] }
        }).then(r => r.json()) as Promise<CityMinimalWithCounts[]>,
        fetchLatestSubstackPostCached()
    ]);

    // Only fetch meeting information for listed cities with official support
    const supportedCities = allCities.filter(city => city.officialSupport && city.isListed);
    
    // Fetch most recent meeting for supported cities in parallel to create citiesWithMeetings
    const citiesWithMeetings: LandingCity[] = await Promise.all(
        supportedCities.map(async city => {
            const meetings: CouncilMeetingWithAdminBodyAndSubjects[] = await fetch(
                `${process.env.NEXT_PUBLIC_URL}/api/cities/${city.id}/meetings?limit=1`, 
                { next: { tags: [`city:${city.id}:meetings`] } }
            ).then(r => r.json());
            
            return {
                ...city,
                mostRecentMeeting: meetings[0]
            };
        })
    );


    return <Landing allCities={allCities} cities={citiesWithMeetings} latestPost={latestPost} />;
} 