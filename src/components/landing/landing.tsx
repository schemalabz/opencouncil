'use client';

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { getLandingPageData, type LandingPageCity } from "@/lib/db/landing";
import { Loader2 } from "lucide-react";
import { Hero } from "./hero";
import { CityOverview } from "./city-overview";

interface LandingProps {
    publicCities: LandingPageCity[];
}
export function Landing({ publicCities }: LandingProps) {
    const { data: session } = useSession();
    const [allCities, setAllCities] = useState(publicCities);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (session?.user) {
            // If we're signed in, re-fetch data so that can get non-public cities
            setIsLoading(true);
            getLandingPageData({ includeUnlisted: true }).then(cities => {
                setAllCities(cities);
                setIsLoading(false);
            });
        }
    }, [session]);

    // Sort cities: public first, then non-public
    const sortedCities = [...allCities].sort((a, b) => {
        if (a.isListed === b.isListed) return 0;
        return a.isListed ? -1 : 1;
    });

    return (
        <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
            <Hero />

            {/* Cities List */}
            <section className="space-y-8 sm:space-y-12 mt-8 sm:mt-16">
                {sortedCities.map((city) => (
                    <CityOverview
                        key={city.id}
                        city={city}
                        showPrivateLabel={!city.isListed && !!session?.user}
                    />
                ))}
            </section>

            {isLoading && (
                <div className="flex justify-center items-center mt-8">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <p className="text-sm text-muted-foreground">Φορτώνονται μη δημόσιες πόλεις...</p>
                </div>
            )}
        </div>
    );
}