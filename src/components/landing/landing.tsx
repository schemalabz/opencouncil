'use client';

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { getLandingPageData, type LandingPageCity } from "@/lib/db/landing";
import { Loader2 } from "lucide-react";
import { Hero } from "./hero";
import { CityOverview } from "./city-overview";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { FloatingPathsBackground } from '@/components/ui/floating-paths';
import { ChevronDown } from 'lucide-react';

interface LandingProps {
    publicCities: LandingPageCity[];
}

export function Landing({ publicCities }: LandingProps) {
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

    useEffect(() => {
        if (session?.user) {
            // If we're signed in, re-fetch data to get non-public cities
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

    const backgroundOpacity = useTransform(
        scrollY,
        [0, windowHeight || 1], 
        [0.5, 0]
    );

    return (
        <div className="min-h-screen">
            {/* Floating Paths Background */}
            <motion.div 
                className="fixed inset-0 -z-10"
                style={{ opacity: backgroundOpacity }}
            >
                <FloatingPathsBackground />
            </motion.div>

            <div className="relative">
                <Hero />

                {/* Scroll Indicator */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.5, duration: 0.5 }}
                    className="relative -mt-16 flex flex-col items-center gap-3 cursor-pointer group"
                    onClick={() => window.scrollTo({ top: window.innerHeight - 100, behavior: 'smooth' })}
                >
                    <motion.span 
                        className="text-base sm:text-lg font-medium text-muted-foreground/80 group-hover:text-primary transition-colors"
                        whileHover={{ scale: 1.05 }}
                    >
                        Δείτε τους δήμους
                    </motion.span>
                    <motion.div
                        className="relative w-8 h-8 flex items-center justify-center"
                        animate={{
                            y: [0, 5, 0],
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "easeInOut",
                        }}
                    >
                        <div className="absolute inset-0 bg-primary/10 rounded-full scale-0 group-hover:scale-100 transition-transform duration-300" />
                        <ChevronDown className="w-5 h-5 text-muted-foreground/80 group-hover:text-primary transition-colors relative z-10" />
                    </motion.div>
                </motion.div>

                <div className="container mx-auto px-4 py-8 sm:py-12">
                    {/* Cities */}
                    <motion.section 
                        className="space-y-12 sm:space-y-16 mt-12 sm:mt-20"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        <div>
                            {sortedCities.map((city) => (
                                <CityOverview
                                    key={city.id}
                                    city={city}
                                    showPrivateLabel={!city.isListed && !!session?.user}
                                />
                            ))}
                        </div>

                        {/* Loading Indicator */}
                        <AnimatePresence>
                            {isLoading && (
                                <motion.div
                                    key="loading"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="flex items-center justify-center py-4"
                                >
                                    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-muted">
                                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                        <p className="text-sm text-muted-foreground">
                                            Φορτώνονται μη δημόσιες πόλεις...
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.section>
                </div>
            </div>
        </div>
    );
}