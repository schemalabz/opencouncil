import type { MessageChannel, MessageStatus } from '@prisma/client';
import { recordOutboundMessage, updateMessage } from '@/lib/db/messages';
import { reconcileMessageStatus } from './reconcile';

export interface OutboundSendResult {
    success: boolean;
    error?: string;
    messageId?: string;
    conversationId?: string;
}

export interface SendAndPersistInput {
    channel: MessageChannel;
    phone: string;
    body: string;
    conversationId?: string | null;
    notificationDeliveryId?: string | null;
    /** The Bird call. Returns the standard `OutboundSendResult` shape. */
    send: () => Promise<OutboundSendResult>;
    reconcile?: boolean;
}

export interface SendAndPersistResult extends OutboundSendResult {
    rowId: string;
    finalStatus?: MessageStatus | null;
    /** Bird failure reason when `finalStatus === 'failed'` */
    finalReason?: string;
}

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

    const result = await input.send();

    await updateMessage(row.id, {
        status: result.success ? 'sent' : 'failed',
        birdMessageId: result.messageId ?? null,
        // (Bird discovers / creates the ID on a fresh `createConversation`).
        ...(input.conversationId == null && result.conversationId
            ? { conversationId: result.conversationId }
            : {}),
    });

    let finalStatus: MessageStatus | null | undefined;
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
