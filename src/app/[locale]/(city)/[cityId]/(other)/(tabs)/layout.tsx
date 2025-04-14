import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CityHeader } from "@/components/cities/CityHeader";
import { CityNavigation } from "@/components/cities/CityNavigation";
import { getCityCached, getCouncilMeetingsCountForCityCached } from "@/lib/cache";
export default async function TabsLayout({
    children,
    params: { cityId }
}: {
    children: React.ReactNode,
    params: { cityId: string }
}) {
    const [city, councilMeetingsCount] = await Promise.all([
        getCityCached(cityId),
        getCouncilMeetingsCountForCityCached(cityId)
    ]);

    if (!city) {
        notFound();
    }

    return (
        <div className="relative md:container md:mx-auto py-8 px-4 md:px-8 space-y-8 z-0">
            <div className="space-y-8">
                <CityHeader 
                    city={city} 
                    councilMeetingsCount={councilMeetingsCount}
                />

                <CityNavigation cityId={cityId} />

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