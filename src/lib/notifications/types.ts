import type { NextResponse } from 'next/server';
import type { MessageChannel, MessageStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Outbound send lifecycle
// ---------------------------------------------------------------------------

export interface OutboundSendResult {
    success: boolean;
    error?: string;
    messageId?: string;
    conversationId?: string;
}


export interface ConversationResult extends OutboundSendResult {
    /** Set when Bird returned 409 and we recovered
     *  the existing conversation ID from the error body. */
    alreadyExisted?: boolean;
    /** Set when a brand-new Bird conversation was created, `false` when we
     *  routed into one we already knew about. */
    created?: boolean;
}

export interface SendAndPersistInput {
    channel: MessageChannel;
    phone: string;
    body: string;
    /** Set when the row belongs to an existing conversation we already know. */
    conversationId?: string | null;
    /** Set when the outbound belongs to a notification-delivery flow so the
     *  inbound webhook can walk back to a user via the row. */
    notificationDeliveryId?: string | null;
    /** The Bird call. Returns the standard `OutboundSendResult` shape. */
    send: () => Promise<OutboundSendResult>;
    /** Default true. Disable when the inbound webhook will reconcile this
     *  message asynchronously, so the synchronous poll would be redundant. */
    reconcile?: boolean;
}

export interface SendAndPersistResult extends OutboundSendResult {
    rowId: string;
    /**
     * Post-reconcile delivery status. Only present when `reconcile` ran
     * `null` means reconciliation was attempted but polling timed out
     * or the channel wasn't configured.
     */
    finalStatus?: MessageStatus | null;
    /** Bird failure reason when `finalStatus === 'failed'` — surfaces
     *  "outside 24h window" etc. up to the UI. */
    finalReason?: string;
}

// ---------------------------------------------------------------------------
// Template + SMS parameters
// ---------------------------------------------------------------------------

export interface MeetingNotificationParams {
    date: string;
    cityName: string;
    subjectsSummary: string;
    adminBody: string;
}

export interface WelcomeParams {
    userName: string;
    cityName: string;
}

// ---------------------------------------------------------------------------
// Bird HTTP response envelopes
// ---------------------------------------------------------------------------

export interface BirdSendMessageResponse {
    id?: string;
    conversationId?: string;
    status?: string;
}

export interface BirdCreateConversationResponse {
    id?: string;
    conversationId?: string;
    conversation?: { id?: string };
    initialMessage?: { id?: string };
    lastMessage?: { id?: string };
    messageId?: string;
    status?: string;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface ReconcileResult {
    status: MessageStatus | null;
    /** Failure reason from Bird */
    reason?: string;
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

export type VerifySignatureResult = { ok: true } | { ok: false; reason: string };

export type VerifyRequestResult =
    | { ok: true; event: unknown }
    | { ok: false; response: NextResponse };
