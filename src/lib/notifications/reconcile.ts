import type { MessageChannel, MessageStatus } from '@prisma/client';
import { updateMessage } from '@/lib/db/messages';
import { mapBirdMessageStatus } from './bird-status';
import { pollForDeliveryStatus, resolveBirdChannel } from './bird';

export interface ReconcileResult {
    status: MessageStatus | null;
    /** Failure reason from Bird */
    reason?: string;
}

/**
 * After an outbound send returns a Bird message ID, poll Bird until the
 * message reaches a terminal status, then write that status onto the local
 * `Message` row.
 */
export async function reconcileMessageStatus(input: {
    localMessageId: string;
    channel: MessageChannel;
    birdMessageId: string;
}): Promise<ReconcileResult> {
    const { channelId } = await resolveBirdChannel(input.channel);
    if (!channelId) return { status: null };

    const { status: finalStatus, reason } = await pollForDeliveryStatus(channelId, input.birdMessageId);
    if (!finalStatus) return { status: null };

    const mapped = mapBirdMessageStatus(finalStatus);
    await updateMessage(input.localMessageId, {
        status: mapped,
        // Only persist a reason on failure; clear it on success / in-flight.
        failureReason: mapped === 'failed' ? reason ?? null : null,
    });
    return { status: mapped, reason: mapped === 'failed' ? reason : undefined };
}
