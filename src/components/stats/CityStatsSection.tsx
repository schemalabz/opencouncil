"use client";

import { useState, useTransition } from "react";
import { TopicDistributionItem, PartyDistributionItem } from "@/lib/db/insights";
import { ColorPercentageRing } from "@/components/ui/color-percentage-ring";
import { getCityStats } from "./cityStatsActions";

interface City {
    id: string;
    name: string;
}

interface CityStatsSectionProps {
    cities: City[];
    initialTopics: TopicDistributionItem[];
    initialParties: PartyDistributionItem[];
}

function SmallRing({
    title,
    items,
    testId,
}: {
    title: string;
    items: { id: string; name: string; colorHex: string; percentage: number }[];
    testId?: string;
}) {
    const ringData = items.map((item) => ({
        color: item.colorHex || "#94a3b8",
        percentage: item.percentage,
    }));
    return (
        <div data-testid={testId} className="flex flex-col items-center gap-4">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            <ColorPercentageRing data={ringData} size={140} thickness={22} />
            <ol className="w-full space-y-1 max-h-36 overflow-y-auto">
                {items.slice(0, 5).map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-xs">
                        <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.colorHex || "#94a3b8" }}
                        />
                        <span className="flex-1 text-muted-foreground truncate">{item.name}</span>
                        <span className="font-medium tabular-nums">{item.percentage}%</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

export function CityStatsSection({ cities, initialTopics, initialParties }: CityStatsSectionProps) {
    const [selectedCityId, setSelectedCityId] = useState<string>("global");
    const [topics, setTopics] = useState<TopicDistributionItem[]>(initialTopics);
    const [parties, setParties] = useState<PartyDistributionItem[]>(initialParties);
    const [isPending, startTransition] = useTransition();

    function handleCityChange(cityId: string) {
        setSelectedCityId(cityId);
        if (cityId === "global") {
            setTopics(initialTopics);
            setParties(initialParties);
            return;
        }
        startTransition(async () => {
            const data = await getCityStats(cityId);
            setTopics(data.topics);
            setParties(data.parties);
        });
    }

    const topicItems = topics.map((t) => ({ id: t.topicId, name: t.topicName, colorHex: t.colorHex, percentage: t.percentage }));
    const partyItems = parties.map((p) => ({ id: p.partyId, name: p.partyName, colorHex: p.colorHex, percentage: p.percentage }));

    return (
        <section
            data-testid="city-stats-section"
            className="bg-card/50 rounded-2xl border border-border/40 p-8"
        >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
                <h2 className="font-semibold text-xl text-foreground flex-1">
                    Στατιστικά ανά Δήμο
                </h2>
                <select
                    id="city-selector"
                    value={selectedCityId}
                    onChange={(e) => handleCityChange(e.target.value)}
                    className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    aria-label="Επιλογή δήμου"
                >
                    <option value="global">Όλοι οι Δήμοι</option>
                    {cities.map((city) => (
                        <option key={city.id} value={city.id}>
                            {city.name}
                        </option>
                    ))}
                </select>
            </div>
            <div
                data-testid="city-stats-rings"
                className={`grid md:grid-cols-2 gap-10 transition-opacity duration-300 ${isPending ? "opacity-50" : "opacity-100"}`}
            >
                <SmallRing title="Θεματικές Κατηγορίες" items={topicItems} testId="city-topics-ring" />
                <SmallRing title="Κατανομή Κομμάτων" items={partyItems} testId="city-parties-ring" />
            </div>
        </section>
    );
}
