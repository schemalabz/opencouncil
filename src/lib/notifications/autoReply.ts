import type { MessageChannel } from '@prisma/client';
import { sendConversationMessage } from '@/lib/notifications/bird';
import { sendAndPersistOutbound } from '@/lib/notifications/outbound';

// Canned reply for inbound messages we don't act on. We don't support
// conversational replies yet, so we tell the user that and point them at the
// only inbound action we do support — unsubscribing.
export const UNSUPPORTED_REPLY_TEXT =
    'Δεν υποστηρίζεται ακόμα η απάντηση σε μηνύματα. Όμως, μπορείτε να απεγγραφείτε από τις ειδοποιήσεις στέλνοντας "ΣΤΟΠ", "Θέλω να απεγγραφώ" κλπ.';

/**
 * Sends the "replies not supported" auto-reply on the conversation the
 * inbound message arrived on. Mirrors `sendUnsubscribeReply`: `reconcile:
 * false` because the inbound webhook reconciles the row when Bird emits the
 * delivery-status event.
 */
export async function sendUnsupportedReply(input: {
    conversationId: string;
    channel: MessageChannel;
    phone: string;
    notificationDeliveryId: string | null;
}): Promise<void> {
    await sendAndPersistOutbound({
        channel: input.channel,
        phone: input.phone,
        body: UNSUPPORTED_REPLY_TEXT,
        conversationId: input.conversationId,
        notificationDeliveryId: input.notificationDeliveryId,
        send: () => sendConversationMessage({
            conversationId: input.conversationId,
            channel: input.channel,
            text: UNSUPPORTED_REPLY_TEXT,
            recipientPhone: input.phone,
        }),
        reconcile: false,
    });
}
