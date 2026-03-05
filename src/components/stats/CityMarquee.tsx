"use client";

import Marquee from "@/components/ui/marquee";
import { CityLeaderboardItem } from "@/lib/db/insights";

interface CityMarqueeProps {
    cities: CityLeaderboardItem[];
}

function CityMiniCard({ city }: { city: CityLeaderboardItem }) {
    const hours = Math.round(city.totalSeconds / 3600);
    return (
        <div className="flex flex-col items-center gap-1 bg-card border border-border/50 rounded-xl px-5 py-3 shadow-sm min-w-[130px] hover:border-primary/40 transition-colors">
            <span className="font-semibold text-sm text-foreground">{city.cityName}</span>
            <span className="text-2xl font-bold text-primary tabular-nums">{hours}</span>
            <span className="text-xs text-muted-foreground">ώρες · {city.meetingCount} συν.</span>
        </div>
    );
}

export function CityMarquee({ cities }: CityMarqueeProps) {
    if (!cities.length) return null;

    return (
        <section className="overflow-hidden">
            <Marquee pauseOnHover>
                {cities.map((city) => (
                    <CityMiniCard key={city.cityId} city={city} />
                ))}
            </Marquee>
        </section>
    );
}
