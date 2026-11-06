import "server-only";
import type { Realm } from "@prisma/client";
import prisma from "./prisma";
import {
    createdTopicSelect, existingTopicSelect,
    type CreatedTopic, type ExistingTopic, type RealmTopicInput,
} from "./types/topic";
import { topicLabelKeys } from "@/lib/zod-schemas/topic";

/**
 * Topic writes with no auth check, for a caller that has already authorized
 * them: the MCP admin tools, which carry a token instead of a session. Lives in
 * a non-"use server" module so it is not registered as a Server Action: topics.ts
 * is one, and a client could otherwise invoke these writes directly.
 */

/** A topic that was not created, and the topic of the realm that has one of its labels. */
export type SkippedTopic = { name: string; existing: ExistingTopic };

/**
 * Add topics to the taxonomy of a realm. A topic with a label (name or
 * name_en, by topicLabelKeys) that a topic of the realm already has,
 * deprecated or not, is skipped, so a repeated call adds nothing twice. The
 * caller passes topics whose labels differ from one another, as
 * createTopicsToolInput checks.
 */
export async function createRealmTopicsDirect(
    realm: Realm,
    topics: RealmTopicInput[],
): Promise<{ created: CreatedTopic[]; skipped: SkippedTopic[] }> {
    const existing = await prisma.topic.findMany({ where: { realm }, select: existingTopicSelect });
    const byKey = new Map(existing.flatMap((topic) => topicLabelKeys(topic).map((key) => [key, topic] as const)));
    const skipped: SkippedTopic[] = [];
    const missing = topics.filter((topic) => {
        const match = topicLabelKeys(topic).map((key) => byKey.get(key)).find((found) => found !== undefined);
        if (match) skipped.push({ name: topic.name, existing: match });
        return !match;
    });
    const created = missing.length
        ? await prisma.topic.createManyAndReturn({ data: missing.map((topic) => ({ ...topic, realm })), select: createdTopicSelect })
        : [];
    return { created, skipped };
}

/** Active topics per realm. A realm with none is absent. */
export async function countActiveTopicsByRealm() {
    return prisma.topic.groupBy({ by: ['realm'], where: { deprecated: false }, _count: { _all: true } });
}
