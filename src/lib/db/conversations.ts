import prisma from './prisma';
import type { Message, MessageChannel } from '@prisma/client';

/**
 * One row per (participant phone, channel) — what the admin sees in the
 * Conversations list. The same phone on WhatsApp and SMS is two distinct
 * Bird conversations and shows as two separate rows. `messages` carries the
 * full thread (oldest first); the page derives the last-message preview and
 * the count from it.
 */
export interface ConversationSummary {
    phone: string;
    channel: MessageChannel;
    messages: Message[];
}

/**
 * A page of conversation summaries plus the total number of conversations
 * matching the filter, so the admin page can render pagination controls.
 */
export interface ConversationSummariesPage {
    conversations: ConversationSummary[];
    total: number;
}

/**
 * v0 implementation: fetch a recent window of messages, then group by
 * (phone, channel) in JS. Sorted by latest message first.
 *
 * The `recentMessageWindow` cap is generous — the admin list won't show more
 * conversations than fit in that window. Once the message volume justifies
 * it, swap this for a SQL `DISTINCT ON (phone, channel) ...` so we're not
 * pulling unbounded rows into the app process.
 *
 * `onlyWithInbound` (default true) hides threads that have no reply from the
 * participant. Outbound-only threads (e.g. broadcasts no one answered, failed
 * deliveries) are noise for the admin view whose purpose is triaging replies.
 * Pass false to include every thread.
 *
 * Pagination (`page`/`pageSize`) is applied over the grouped, filtered, and
 * sorted conversation list — not over raw messages — so a page always holds
 * whole threads. `total` is the full count before slicing, for page controls.
 */
export async function getConversationSummaries(
    {
        page = 1,
        pageSize = 50,
        recentMessageWindow = 1000,
        onlyWithInbound = true,
    }: {
        page?: number;
        pageSize?: number;
        recentMessageWindow?: number;
        onlyWithInbound?: boolean;
    } = {},
): Promise<ConversationSummariesPage> {
    // Fetch newest-first so the window is the *recent* slice, not the oldest;
    // otherwise once the table exceeds `recentMessageWindow` rows, fresh
    // conversations would silently drop off the admin view. We reverse each
    // conversation's messages below so the page still renders oldest-first.
    const messages = await prisma.message.findMany({
        orderBy: { createdAt: 'desc' },
        take: recentMessageWindow,
    });

    // Composite key keeps WhatsApp and SMS threads to the same phone separate.
    const groupKey = (m: { phone: string; channel: MessageChannel }) => `${m.channel}:${m.phone}`;

    const byKey = new Map<string, ConversationSummary>();
    for (const msg of messages) {
        const key = groupKey(msg);
        const existing = byKey.get(key);
        if (existing) {
            existing.messages.push(msg);
        } else {
            byKey.set(key, { phone: msg.phone, channel: msg.channel, messages: [msg] });
        }
    }
    // Each `messages` array is currently newest-first (mirrors the query
    // order); flip to oldest-first for chat-style rendering. The first item
    // post-reversal is the oldest, the last item is the latest — which is
    // also what we sort the conversation list by.
    for (const conv of byKey.values()) {
        conv.messages.reverse();
    }

    // Sort conversations by most recent message first.
    const ordered = Array.from(byKey.values())
        .filter((conv) => !onlyWithInbound || conv.messages.some((m) => m.direction === 'inbound'))
        .sort((a, b) => {
            const aLast = a.messages[a.messages.length - 1].createdAt.getTime();
            const bLast = b.messages[b.messages.length - 1].createdAt.getTime();
            return bLast - aLast;
        });

    const start = Math.max(0, (page - 1) * pageSize);
    return {
        conversations: ordered.slice(start, start + pageSize),
        total: ordered.length,
    };
}
