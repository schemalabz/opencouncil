import type { MessageStatus } from '@prisma/client';

/**
 * Translate Bird's message status strings into our local `MessageStatus` enum.
 * Pure helper, intentionally outside `bird.ts` so it isn't exposed as a
 * server action (the bird module has `"use server"`).
 *
 * Bird's vocabulary observed so far:
 *   - `delivered`, `read`        → delivered
 *   - `rejected`, `failed`,
 *     `sending_failed`,
 *     `delivery_failed`          → failed
 *   - `pending`, `queued`        → pending
 *   - `sent`, `accepted` (or
 *     anything else we don't
 *     specifically recognize)    → sent
 */
export function mapBirdMessageStatus(birdStatus: string | undefined): MessageStatus {
    const s = String(birdStatus ?? '').toLowerCase();
    if (s === 'delivered' || s === 'read') return 'delivered';
    if (s === 'rejected' || s === 'failed' || s.includes('failed')) return 'failed';
    if (s === 'pending' || s === 'queued') return 'pending';
    return 'sent';
}
