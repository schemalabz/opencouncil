import {
    getGlobalKPIsCached,
    getTopicDistributionCached,
    getPartyDistributionCached,
    getMonthlyGrowthCached,
    getCityLeaderboardCached,
    getAllCitiesMinimalCached,
} from "@/lib/cache/queries";
import { StatsHero } from "@/components/stats/StatsHero";
import { TopicPartyRings } from "@/components/stats/TopicPartyRings";
import { GrowthTrendChart } from "@/components/stats/GrowthTrendChart";
import { CityLeaderboard } from "@/components/stats/CityLeaderboard";
import { CityStatsSection } from "@/components/stats/CityStatsSection";
import { CityMarquee } from "@/components/stats/CityMarquee";
import { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: "Στατιστικά Πλατφόρμας | OpenCouncil",
        description: "Δείτε πόσες ώρες δημοτικών συνεδριάσεων έχουμε καταγράψει, ποια κόμματα μιλάνε περισσότερο και ποιοι δήμοι ηγούνται.",
    };
}

export default async function StatsPage() {
    const [kpis, topics, parties, growth, leaderboard, allCities] = await Promise.all([
        getGlobalKPIsCached(),
        getTopicDistributionCached(),
        getPartyDistributionCached(),
        getMonthlyGrowthCached(),
        getCityLeaderboardCached(),
        getAllCitiesMinimalCached(),
    ]);

    const cities = allCities
        .filter((c) => c.status === "listed")
        .map((c) => ({ id: c.id, name: c.name }));

    return (
        <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
            {/* Hero section with animated KPI counters */}
            <StatsHero kpis={kpis} />

            {/* City showcase marquee */}
            <CityMarquee cities={leaderboard} />

            {/* Bento grid: chart + leaderboard side by side on large screens */}
            <div className="grid lg:grid-cols-2 gap-8">
                <GrowthTrendChart data={growth} />
                <CityLeaderboard cities={leaderboard} />
            </div>

            {/* Topic & Party global rings */}
            <TopicPartyRings topics={topics} parties={parties} />

            {/* Per-city filter section */}
            <CityStatsSection
                cities={cities}
                initialTopics={topics}
                initialParties={parties}
            />
        </div>
    );
}
