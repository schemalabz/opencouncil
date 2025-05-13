'use client';

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useMemo } from "react";
import { getLandingPageData, SubstackPost, type LandingPageCity, type LandingPageData } from "@/lib/db/landing";
import { Loader2, Bell } from "lucide-react";
import { Hero } from "./hero";
import { CityOverview } from "./city-overview";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { FloatingPathsBackground } from '@/components/ui/floating-paths';
import { ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";

interface LandingProps {
    publicCities: LandingPageCity[];
    latestPost: SubstackPost | undefined;
}

export function Landing({ publicCities, latestPost }: LandingProps) {
    const { data: session } = useSession();
    const [allCities, setAllCities] = useState<LandingPageCity[]>(publicCities);
    const [isLoading, setIsLoading] = useState(false);
    const { scrollY } = useScroll();
    const [windowHeight, setWindowHeight] = useState(0);

    useEffect(() => {
        setWindowHeight(window.innerHeight);
        const handleResize = () => setWindowHeight(window.innerHeight);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Only fetch session data once when session changes
    const fetchCities = useCallback(async () => {
        if (session?.user) {
            setIsLoading(true);
            try {
                const newData = await getLandingPageData({ includeUnlisted: true });
                setAllCities(newData.cities);
            } catch (error) {
                console.error("Error fetching cities:", error);
            } finally {
                setIsLoading(false);
            }
        }
    }, [session]);

    useEffect(() => {
        fetchCities();
    }, [fetchCities]);

    // Sort cities: public first, then non-public
    const sortedCities = useMemo(() =>
        [...allCities].sort((a, b) => {
            if (a.isListed === b.isListed) return a.name.localeCompare(b.name);
            return a.isListed ? -1 : 1;
        }),
        [allCities]);

    const backgroundOpacity = useTransform(
        scrollY,
        [0, windowHeight || 1],
        [0.5, 0]
    );

    const scrollToContent = () => {
        window.scrollTo({
            top: window.innerHeight - 100,
            behavior: 'smooth'
        });
    };

    return (
        <div className="min-h-screen relative">
            {/* Hero Section - Full Width */}
            <Hero latestPost={latestPost} />

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
                        <div>
                            <h2 className="text-xl font-semibold mb-2">Μείνετε ενημερωμένοι</h2>
                            <p className="text-muted-foreground mb-0">
                                Λάβετε ενημερώσεις για θέματα που συζητιούνται στα δημοτικά συμβούλια
                                για τις περιοχές και τα θέματα που σας ενδιαφέρουν.
                            </p>
                        </div>
                        <Button asChild size="lg" className="whitespace-nowrap">
                            <Link href="/signup">
                                <Bell className="mr-2 h-4 w-4" />
                                Γραφτείτε στις ενημερώσεις
                            </Link>
                        </Button>
                    </div>

                    <div className="space-y-16">
                        {sortedCities.map((city) => (
                            <CityOverview
                                key={city.id}
                                city={city}
                                showPrivateLabel={!city.isListed && !!session?.user}
                            />
                        ))}
                    </div>

                    {/* Loading Indicator */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-4">
                            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-muted">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">
                                    Φορτώνονται μη δημόσιες πόλεις...
                                </p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}