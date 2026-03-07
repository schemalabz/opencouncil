"use server";

import { TopicDistributionItem, PartyDistributionItem } from "@/lib/db/insights";
import { getTopicDistributionCached, getPartyDistributionCached } from "@/lib/cache/queries";

export async function getCityStats(cityId: string): Promise<{
    topics: TopicDistributionItem[];
    parties: PartyDistributionItem[];
}> {
    const [topics, parties] = await Promise.all([
        getTopicDistributionCached(cityId),
        getPartyDistributionCached(cityId),
    ]);
    return { topics, parties };
}
