"use server";

import { getTopicDistribution, getPartyDistribution, TopicDistributionItem, PartyDistributionItem } from "@/lib/db/insights";

export async function getCityStats(cityId: string): Promise<{
    topics: TopicDistributionItem[];
    parties: PartyDistributionItem[];
}> {
    const [topics, parties] = await Promise.all([
        getTopicDistribution(cityId),
        getPartyDistribution(cityId),
    ]);
    return { topics, parties };
}
