"use client";

import { ColorPercentageRing } from "@/components/ui/color-percentage-ring";
import { TopicDistributionItem, PartyDistributionItem } from "@/lib/db/insights";

interface TopicPartyRingsProps {
    topics: TopicDistributionItem[];
    parties: PartyDistributionItem[];
}

function RingWithLegend({
    title,
    items,
    testId,
    centerLabel,
}: {
    title: string;
    items: { id: string; name: string; colorHex: string; percentage: number }[];
    testId: string;
    centerLabel: string;
}) {
    const ringData = items.map((item) => ({
        color: item.colorHex || "#94a3b8",
        percentage: item.percentage,
    }));

    return (
        <div data-testid={testId} className="flex flex-col items-center gap-6">
            <h3 className="font-semibold text-lg text-foreground">{title}</h3>
            <div className="relative">
                <ColorPercentageRing data={ringData} size={180} thickness={28}>
                    <span className="text-sm text-muted-foreground font-medium text-center leading-tight">
                        {items.length}
                        <br />
                        <span className="text-xs">{centerLabel}</span>
                    </span>
                </ColorPercentageRing>
            </div>
            <ol className="w-full space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {items.slice(0, 8).map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-sm">
                        <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.colorHex || "#94a3b8" }}
                        />
                        <span className="flex-1 text-muted-foreground truncate">{item.name}</span>
                        <span className="font-medium tabular-nums">{item.percentage}%</span>
                    </li>
                ))}
                {items.length > 8 && (
                    <li className="text-xs text-muted-foreground text-center pt-1">
                        +{items.length - 8} ακόμα
                    </li>
                )}
            </ol>
        </div>
    );
}

export function TopicPartyRings({ topics, parties }: TopicPartyRingsProps) {
    const topicItems = topics.map((t) => ({
        id: t.topicId,
        name: t.topicName,
        colorHex: t.colorHex,
        percentage: t.percentage,
    }));
    const partyItems = parties.map((p) => ({
        id: p.partyId,
        name: p.partyName,
        colorHex: p.colorHex,
        percentage: p.percentage,
    }));

    return (
        <section className="grid md:grid-cols-2 gap-10 bg-card/50 rounded-2xl border border-border/40 p-8">
            <RingWithLegend title="Θεματικές Κατηγορίες" items={topicItems} testId="topics-ring" centerLabel="κατηγορίες" />
            <RingWithLegend title="Κατανομή Κομμάτων" items={partyItems} testId="parties-ring" centerLabel="κόμματα" />
        </section>
    );
}
