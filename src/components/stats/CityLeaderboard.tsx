"use client";

import { motion } from "framer-motion";
import { CityLeaderboardItem } from "@/lib/db/insights";

interface CityLeaderboardProps {
    cities: CityLeaderboardItem[];
}

export function CityLeaderboard({ cities }: CityLeaderboardProps) {
    const maxSeconds = Math.max(cities[0]?.totalSeconds ?? 0, 1);

    return (
        <section
            data-testid="city-leaderboard"
            className="bg-card/50 rounded-2xl border border-border/40 p-8"
        >
            <h2 className="font-semibold text-xl text-foreground mb-6">
                Κατάταξη Δήμων
            </h2>
            <ol className="space-y-3">
                {cities.map((city, idx) => {
                    const widthPct = (city.totalSeconds / maxSeconds) * 100;
                    const hours = Math.round(city.totalSeconds / 3600);
                    return (
                        <li key={city.cityId} data-testid={`leaderboard-city-${idx}`}>
                            <div className="flex items-center gap-3 mb-1">
                                <span className="text-xs text-muted-foreground w-5 text-right font-mono">
                                    {idx + 1}
                                </span>
                                <span className="flex-1 text-sm font-medium text-foreground truncate">
                                    {city.cityName}
                                </span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {hours}h · {city.meetingCount} συν.
                                </span>
                            </div>
                            <div className="pl-8 h-2 rounded-full bg-muted overflow-hidden">
                                <motion.div
                                    className="h-full rounded-full bg-primary"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${widthPct}%` }}
                                    transition={{ duration: 0.8, delay: idx * 0.04, ease: "easeOut" }}
                                />
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
