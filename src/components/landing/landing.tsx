'use client';

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LandingPageData, LandingCity } from "@/lib/db/landing";
import { CityWithCounts, CityMinimalWithCounts } from "@/lib/db/cities";
import { CouncilMeetingWithAdminBodyAndSubjects } from "@/lib/db/meetings";
import { Hero } from "./hero";
import { CityOverview } from "./city-overview";
import { ChevronDown } from 'lucide-react';
import { MunicipalitySelector } from '@/components/onboarding/selectors/MunicipalitySelector';

export function Landing({ allCities, cities, latestPost }: LandingPageData) {
    const { status } = useSession();
    const router = useRouter();
    const [citiesWithMeetings, setCitiesWithMeetings] = useState<LandingCity[]>(cities);
    const [isLoadingUserCities, setIsLoadingUserCities] = useState(false);
    const [selectedCity, setSelectedCity] = useState<CityMinimalWithCounts | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);

    const handleCitySelect = (city: CityMinimalWithCounts | null) => {
        setSelectedCity(city);
        if (city) {
            setIsNavigating(true);
            const targetUrl = city.isPending ? `/${city.id}/petition` : `/${city.id}`;
            router.push(targetUrl);
        }
    };

    // Fetch additional user-specific cities when authenticated
    useEffect(() => {
        const fetchUserSpecificCities = async () => {
            // Only fetch if user is authenticated
            if (status !== 'authenticated') {
                return;
            }

            setIsLoadingUserCities(true);
            try {
                // Fetch all cities the user can access (including public + unlisted ones they administer)
                const userCities: CityWithCounts[] = await fetch('/api/cities?includeUnlisted=true')
                    .then(r => r.json());
                // Fetch meeting data for all supported cities
                const userCitiesWithMeetings: LandingCity[] = await Promise.all(
                    userCities.map(async city => {
                        try {
                            const meetings: CouncilMeetingWithAdminBodyAndSubjects[] = await fetch(
                                `/api/cities/${city.id}/meetings?limit=1`,
                                { next: { tags: [`city:${city.id}:meetings`] } }
                            ).then(r => r.json());
                            
                            return {
                                ...city,
                                mostRecentMeeting: meetings[0]
                            };
                        } catch (error) {
                            console.error(`Error fetching meetings for city ${city.id}:`, error);
                            return {
                                ...city,
                                mostRecentMeeting: undefined
                            };
                        }
                    })
                );
                
                // Replace cities entirely with user-specific list
                setCitiesWithMeetings(userCitiesWithMeetings);
            } catch (error) {
                console.error('Error fetching user-specific cities:', error);
            } finally {
                setIsLoadingUserCities(false);
            }
        };

        fetchUserSpecificCities();
    }, [status]);


    const scrollToContent = () => {
        window.scrollTo({
            top: window.innerHeight - 100,
            behavior: 'smooth'
        });
    };

    return (
        <div className="min-h-screen relative">
            {/* Hero Section - Full Width */}
            <Hero
                latestPost={latestPost}
                cities={allCities}
                value={selectedCity}
                onCitySelect={handleCitySelect}
                isNavigating={isNavigating}
            />

            {/* Scroll Indicator */}
            <div
                className="relative -mt-16 flex flex-col items-center gap-3 cursor-pointer group opacity-0 animate-fade-in"
                style={{ animationDelay: '1s', animationFillMode: 'forwards' }}
                onClick={scrollToContent}
            >
                <span className="text-base sm:text-lg font-medium text-muted-foreground/80 group-hover:text-primary transition-colors">
                    Δείτε τους δήμους
                </span>
                <div className="relative w-8 h-8 flex items-center justify-center animate-bounce">
                    <div className="absolute inset-0 bg-primary/10 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300" />
                    <ChevronDown className="w-5 h-5 text-muted-foreground/80 group-hover:text-primary transition-colors relative z-10" />
                </div>
            </div>

            {/* Cities Section - Contained */}
            <div className="container mx-auto px-4 py-8 sm:py-12 relative z-10">
                <section className="space-y-12 sm:space-y-16 mt-12 sm:mt-20">
                    {/* Notification Signup Callout */}
                    <div className="bg-muted/50 rounded-lg p-6 border border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="w-full sm:w-1/2">
                            <h2 className="text-xl font-semibold mb-2">Μείνετε ενημερωμένοι</h2>
                            <p className="text-muted-foreground mb-0">
                                Λάβετε ενημερώσεις για τα θέματα και τις τοποθεσίες που σας ενδιαφέρουν, πριν ή αφότου αυτά συζητηθούν στο δημοτικό συμβούλιο.
                            </p>
                        </div>
                        <div className="w-full sm:w-1/2">
                            <MunicipalitySelector
                                cities={allCities}
                                value={selectedCity}
                                onCitySelect={handleCitySelect}
                                isNavigating={isNavigating}
                                hideQuickSelection={true}
                            />
                        </div>
                    </div>

                    {/* City Overview Section */}
                    <div className="space-y-16">
                        {citiesWithMeetings.map((city) => (
                            <CityOverview
                                key={city.id}
                                city={city}
                                showPrivateLabel={!city.isListed}
                            />
                        ))}
                        
                        {/* Loading indicator for additional cities */}
                        {isLoadingUserCities && (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                                <span className="ml-3 text-muted-foreground">Φορτώνονται μη δημόσιες πόλεις...</span>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}