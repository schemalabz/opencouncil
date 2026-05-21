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
 * v0 implementation: fetch a recent window of messages, then group by
 * (phone, channel) in JS. Sorted by latest message first.
 *
 * The `recentMessageWindow` cap is generous — the admin list won't show more
 * conversations than fit in that window. Once the message volume justifies
 * it, swap this for a SQL `DISTINCT ON (phone, channel) ...` so we're not
 * pulling unbounded rows into the app process.
 */
export async function getConversationSummaries(
    limit = 50,
    recentMessageWindow = 1000,
): Promise<ConversationSummary[]> {
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
    return Array.from(byKey.values())
        .sort((a, b) => {
            const aLast = a.messages[a.messages.length - 1].createdAt.getTime();
            const bLast = b.messages[b.messages.length - 1].createdAt.getTime();
            return bLast - aLast;
        })
        .slice(0, limit);
}
