import { mapBirdMessageStatus } from '@/lib/notifications/bird-status';
import type { MessageChannel, MessageDirection, MessageStatus } from '@prisma/client';

/**
 * Defensive subset of a Bird webhook message. The Conversations API has
 * shifted field names between versions/events, so the type unions every
 * variant we've seen.
 */
export interface BirdMessageLike {
    id?: string;
    messageId?: string;
    conversationId?: string;
    conversation_id?: string;
    channelId?: string;
    channel?: string;
    direction?: string;
    kind?: string;
    status?: string;
    reason?: string;
    failure?: { description?: string };
    sender?: {
        type?: string;
        identifierValue?: string;
        phone?: string;
        contact?: {
            identifierValue?: string;
            platformAddress?: string;
        };
    };
    from?: string | { identifierValue?: string; phone?: string };
    contact?: { identifierValue?: string };
    participant?: { identifierValue?: string };
    preview?: { text?: string };
    body?: string | { text?: string | { text?: string } };
    text?: string;
    // Outbound events: sender is `type: "flow"` (us) with no phone — the
    // recipient phone lives here instead.
    recipients?: Array<{ identifierValue?: string }>;
}

export interface BirdWebhookPayload {
    id?: string;
    channelId?: string;
    lastMessage?: BirdMessageLike;
    message?: BirdMessageLike;
    // Outbound events fall back to this when `lastMessage.recipients` is
    // missing: the participant with `type: "contact"` is the user.
    featuredParticipants?: Array<{ type?: string; contact?: { identifierValue?: string } }>;
}

interface BirdWebhookEvent {
    event?: string;
    payload?: BirdWebhookPayload;
    data?: BirdWebhookPayload;
}

export interface ExtractedMessageFields {
    birdMessageId?: string;
    conversationId?: string;
    direction: MessageDirection;
    phone?: string;
    body: string;
    channel: MessageChannel;
    status: MessageStatus;
    failureReason?: string;
}

export interface UnwrappedEvent {
    payload: BirdWebhookPayload;
    message: BirdMessageLike | undefined;
    conversationId: string | undefined;
    payloadChannelId: string | undefined;
}

/** Bird channel IDs — passed in by callers instead of read from env so
 *  the extractor stays pure and trivially testable. */
export interface ChannelIds {
    sms?: string;
    whatsapp?: string;
}

/** Extract plain text from Bird's variant body shape (string | nested object). */
function extractBodyText(body: BirdMessageLike['body']): string | undefined {
    if (!body || typeof body === 'string') return undefined;
    if (body.text && typeof body.text === 'object' && typeof body.text.text === 'string') {
        return body.text.text;
    }
    if (typeof body.text === 'string') return body.text;
    return undefined;
}

export function unwrapEvent(event: unknown): UnwrappedEvent {
    const evt = (event ?? {}) as BirdWebhookEvent;
    const eventName = String(evt.event ?? '');
    const payload: BirdWebhookPayload = evt.payload ?? evt.data ?? (evt as BirdWebhookPayload);

    if (eventName === 'conversation.updated' && payload.lastMessage) {
        return {
            payload,
            message: payload.lastMessage,
            conversationId: payload.id,
            payloadChannelId: payload.channelId,
        };
    }

    const message = payload.message ?? (payload as BirdMessageLike);
    return {
        payload,
        message,
        conversationId: message.conversationId ?? message.conversation_id,
        payloadChannelId: message.channelId ?? payload.channelId,
    };
}

export function extractDirection(message: BirdMessageLike | undefined): MessageDirection {
    const explicit = String(message?.direction ?? message?.kind ?? '').toLowerCase();
    if (explicit.includes('out')) return 'outbound';
    if (explicit.includes('in')) return 'inbound';
    const senderType = String(message?.sender?.type ?? '').toLowerCase();
    if (senderType === 'contact') return 'inbound';
    if (senderType) return 'outbound';
    return 'inbound';
}

export function extractInboundPhone(message: BirdMessageLike | undefined): string | undefined {
    const fromObj = message?.from && typeof message.from === 'object' ? message.from : undefined;
    const fromStr = typeof message?.from === 'string' ? message.from : undefined;

    return (
        message?.sender?.contact?.identifierValue ??
        message?.sender?.contact?.platformAddress ??
        fromObj?.identifierValue ??
        fromObj?.phone ??
        fromStr ??
        message?.sender?.identifierValue ??
        message?.contact?.identifierValue ??
        message?.sender?.phone ??
        message?.participant?.identifierValue
    );
}

export function extractOutboundPhone(
    message: BirdMessageLike | undefined,
    payload: BirdWebhookPayload,
): string | undefined {
    return (
        message?.recipients?.[0]?.identifierValue ??
        payload.featuredParticipants
            ?.find((p) => p?.type === 'contact')
            ?.contact?.identifierValue
    );
}

export function extractPhone(
    direction: MessageDirection,
    message: BirdMessageLike | undefined,
    payload: BirdWebhookPayload,
): string | undefined {
    return direction === 'outbound'
        ? extractOutboundPhone(message, payload)
        : extractInboundPhone(message);
}

export function extractBody(message: BirdMessageLike | undefined): string {
    return (
        message?.preview?.text ??
        extractBodyText(message?.body) ??
        message?.text ??
        (typeof message?.body === 'string' ? message.body : '')
    );
}

export function extractChannel(
    payloadChannelId: string | undefined,
    message: BirdMessageLike | undefined,
    channelIds: ChannelIds,
): MessageChannel {
    if (payloadChannelId && payloadChannelId === channelIds.sms) return 'sms';
    if (payloadChannelId && payloadChannelId === channelIds.whatsapp) return 'whatsapp';
    if (String(message?.channel ?? '').toLowerCase().includes('sms')) return 'sms';
    return 'whatsapp';
}

export function extractMessageFields(
    event: unknown,
    channelIds: ChannelIds,
): ExtractedMessageFields {
    const { payload, message, conversationId, payloadChannelId } = unwrapEvent(event);

    const direction = extractDirection(message);
    const phone = extractPhone(direction, message, payload);
    const body = extractBody(message);
    const channel = extractChannel(payloadChannelId, message, channelIds);

    return {
        birdMessageId: message?.id ?? message?.messageId,
        conversationId,
        direction,
        phone,
        body,
        channel,
        status: mapBirdMessageStatus(message?.status),
        failureReason: message?.reason ?? message?.failure?.description ?? undefined,
    };
}
