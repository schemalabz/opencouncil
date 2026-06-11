import { recordOutboundMessage, updateMessage } from '@/lib/db/messages';
import { reconcileMessageStatus } from './reconcile';
import type { SendAndPersistInput, SendAndPersistResult } from './types';

/**
 * Standard outbound lifecycle: persist a `Message` row, call Bird, update
 * the row with the result, then optionally poll Bird for the terminal
 * status.
 */
export async function sendAndPersistOutbound(
    input: SendAndPersistInput,
): Promise<SendAndPersistResult> {
    const row = await recordOutboundMessage({
        channel: input.channel,
        phone: input.phone,
        body: input.body,
        conversationId: input.conversationId ?? null,
        notificationDeliveryId: input.notificationDeliveryId ?? null,
    });

    let result: Awaited<ReturnType<typeof input.send>>;
    try {
        result = await input.send();
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        await updateMessage(row.id, { status: 'failed', failureReason: reason });
        throw error;
    }

    await updateMessage(row.id, {
        status: result.success ? 'sent' : 'failed',
        birdMessageId: result.messageId ?? null,
        failureReason: result.success ? null : result.error ?? null,
        // (Bird discovers / creates the ID on a fresh `createConversation`).
        ...(input.conversationId == null && result.conversationId
            ? { conversationId: result.conversationId }
            : {}),
    });

    let finalStatus: SendAndPersistResult['finalStatus'];
    let finalReason: string | undefined;
    if (input.reconcile !== false && result.success && result.messageId) {
        const reconciled = await reconcileMessageStatus({
            localMessageId: row.id,
            channel: input.channel,
            birdMessageId: result.messageId,
        });
        finalStatus = reconciled.status;
        finalReason = reconciled.reason;
    }

    return { ...result, rowId: row.id, finalStatus, finalReason };
}
