import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CityHeader } from "@/components/cities/CityHeader";
import { CityNavigation } from "@/components/cities/CityNavigation";
import { getCityCached, getCityMessageCached, getPartiesForCityCached, getPeopleForCityCached } from "@/lib/cache";
export default async function TabsLayout({
    children,
    params: { cityId }
}: {
    children: React.ReactNode,
    params: { cityId: string }
}) {
    const [city, cityMessage, parties, people] = await Promise.all([
        getCityCached(cityId),
        getCityMessageCached(cityId),
        getPartiesForCityCached(cityId),
        getPeopleForCityCached(cityId)
    ]);

    if (!city) {
        notFound();
    }

    // Check if city has no data (eligible for city creator)
    const hasNoData = city._count.councilMeetings === 0 && parties.length === 0 && people.length === 0;

    return (
        <div className="relative md:container md:mx-auto py-8 px-4 md:px-8 space-y-8 z-0">
            <div className="space-y-8">
                <CityHeader
                    city={city}
                    councilMeetingsCount={city._count.councilMeetings}
                    cityMessage={cityMessage}
                    hasNoData={hasNoData}
                />

                <CityNavigation cityId={cityId} city={city as any} />

                <Suspense fallback={
                    <div className="flex justify-center items-center h-32">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                }>
                    <div className="space-y-4 md:space-y-6">
                        {children}
                    </div>
                </Suspense>
            </div>
        </div>
    );
} 