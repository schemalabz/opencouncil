"use server";

import { env } from '@/env.mjs';
import { findRecentConversationIdByPhone } from '@/lib/db/messages';
import { normalizePhone } from './phone';
import type {
    BirdCreateConversationResponse,
    BirdSendMessageResponse,
    ConversationResult,
    MeetingNotificationParams,
    OutboundSendResult,
    WelcomeParams,
} from './types';

/** WhatsApp before-/after-meeting template params: the shared meeting
 *  shape plus the notification ID Bird needs to thread the template. */
interface WhatsAppTemplateParams extends MeetingNotificationParams {
    notificationId: string;
}


/**
 * Check if Bird credentials are configured
 */
function checkCredentials(channelId: string | undefined, serviceName: string): { configured: boolean; error?: string } {
    if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID || !channelId) {
        return { configured: false, error: `Bird ${serviceName} not configured` };
    }
    return { configured: true };
}

const BIRD_TERMINAL_STATUSES = ['delivered', 'delivery_failed', 'sending_failed', 'rejected', 'skipped'] as const;

const POLL_MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resolve a logical channel ('whatsapp' | 'sms') to its configured Bird
 */
export async function resolveBirdChannel(
    channel: 'whatsapp' | 'sms',
): Promise<{ channelId?: string; error?: string }> {
    if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID) {
        return { error: 'Bird workspace not configured' };
    }
    const channelId = channel === 'sms' ? env.BIRD_SMS_CHANNEL_ID : env.BIRD_WHATSAPP_CHANNEL_ID;
    if (!channelId) {
        const envName = channel === 'sms' ? 'BIRD_SMS_CHANNEL_ID' : 'BIRD_WHATSAPP_CHANNEL_ID';
        return { error: `${envName} is not configured` };
    }
    return { channelId };
}

/**
 * Fetch a single Bird message's current state by hitting the path-form
 * single-resource endpoint. Returns the raw status string and any failure
 * reason from Bird's response.
 *
 * Endpoint: GET /workspaces/{ws}/channels/{channelId}/messages/{messageId}
 */
export async function getMessageStatus(
    channelId: string,
    messageId: string,
): Promise<{ status?: string; reason?: string; error?: string }> {
    if (!env.BIRD_API_KEY || !env.BIRD_WORKSPACE_ID) {
        return { error: 'Bird workspace not configured' };
    }
    try {
        const url = `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${channelId}/messages/${messageId}`;
        const response = await fetch(url, {
            headers: { Authorization: `AccessKey ${env.BIRD_API_KEY}` },
        });
        if (!response.ok) {
            return { error: `Bird returned ${response.status}` };
        }
        const data = await response.json();
        return {
            status: data?.status,
            reason: data?.reason ?? data?.failure?.description,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Poll Bird API until message reaches a terminal status or timeout.
 */
export async function pollForDeliveryStatus(
    channelId: string,
    messageId: string
): Promise<{ status: string | null; reason?: string }> {
    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(POLL_INTERVAL_MS);

        const { status, reason } = await getMessageStatus(channelId, messageId);
        console.log(`Bird message ${messageId} poll ${attempt}/${POLL_MAX_ATTEMPTS}: status=${status}`);

        if (status && (BIRD_TERMINAL_STATUSES as readonly string[]).includes(status)) {
            return { status, reason };
        }
    }

    console.log(`Bird message ${messageId} polling timed out after ${POLL_MAX_ATTEMPTS} attempts`);
    return { status: null };
}

/**
 * Minimal envelope fields read inside `makeBirdRequest` itself.
 */
interface BirdResponseEnvelope {
    id?: string;
    conversationId?: string;
    conversation?: { id?: string };
    status?: string;
    detail?: string;
    title?: string;
}

async function makeBirdRequest<T = unknown>(
    url: string,
    payload: unknown,
    logPrefix: string,
): Promise<{
    success: boolean;
    error?: string;
    status?: number;
    errorBody?: unknown;
    messageId?: string;
    conversationId?: string;
    data?: T;
}> {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `AccessKey ${env.BIRD_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`${logPrefix} API error:`, response.status, errorText);
            // Try to parse as JSON for structured callers (e.g. 409 recovery
            // that needs to read details.conversationId); fall back to text.
            let errorBody: unknown = errorText;
            try { errorBody = JSON.parse(errorText); } catch { /* not JSON */ }
            return {
                success: false,
                error: `API returned ${response.status}: ${errorText}`,
                status: response.status,
                errorBody,
            };
        }

        const raw: unknown = await response.json();
        const envelope = (raw ?? {}) as BirdResponseEnvelope;

        // Check for immediate failure in response body even if status is 2xx
        if (envelope.status === 'failed' || envelope.status === 'rejected') {
            return {
                success: false,
                error: envelope.detail || envelope.title || `Bird status: ${envelope.status}`,
                data: raw as T,
            };
        }

        return {
            success: true,
            messageId: envelope.id,
            conversationId: envelope.conversationId ?? envelope.conversation?.id,
            data: raw as T,
        };
    } catch (error) {
        console.error(`Error ${logPrefix.toLowerCase()}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

type TemplateBody = {
    projectId: string;
    version: string;
    locale: string;
    parameters: Array<{ type: string; key: string; value: string }>;
};

type WelcomeTemplateParams = WelcomeParams;

type ConstructTemplateInput =
    | { type: 'beforeMeeting' | 'afterMeeting'; params: WhatsAppTemplateParams }
    | { type: 'welcome'; params: WelcomeTemplateParams };

/**
 * Pure helper that assembles the WhatsApp-template payload Bird's APIs expect.
 * Returns `{ error }` when the env-configured project ID is missing for the requested template type.
 */
function constructTemplate(input: ConstructTemplateInput): { template?: TemplateBody; error?: string } {
    if (input.type === 'welcome') {
        const projectId = env.BIRD_WHATSAPP_TEMPLATE_WELCOME;
        if (!projectId) {
            return { error: 'Welcome template project ID not configured' };
        }
        return {
            template: {
                projectId,
                version: 'latest',
                locale: 'el',
                parameters: [
                    { type: 'string', key: 'userName', value: input.params.userName },
                    { type: 'string', key: 'cityName', value: input.params.cityName },
                ],
            },
        };
    }

    const templateProjectId = input.type === 'beforeMeeting'
        ? env.BIRD_WHATSAPP_TEMPLATE_BEFORE_MEETING
        : env.BIRD_WHATSAPP_TEMPLATE_AFTER_MEETING;

    if (!templateProjectId) {
        return { error: `Template project ID not configured for ${input.type}` };
    }

    return {
        template: {
            projectId: templateProjectId,
            version: 'latest',
            locale: 'el',
            parameters: [
                { type: 'string', key: 'date', value: input.params.date },
                { type: 'string', key: 'cityName', value: input.params.cityName },
                { type: 'string', key: 'subjectsSummary', value: input.params.subjectsSummary },
                { type: 'string', key: 'adminBody', value: input.params.adminBody },
                { type: 'string', key: 'notificationId', value: input.params.notificationId },
            ],
        },
    };
}

/**
 * Send a message (text or template) INTO an existing Bird conversation via
 * `POST /workspaces/{ws}/conversations/{id}/messages`.
 */
export async function sendConversationMessage(input: {
    conversationId: string;
    channel?: 'whatsapp' | 'sms';
    text?: string;
    template?: TemplateBody;
    recipientPhone?: string;
}): Promise<OutboundSendResult> {
    if (!input.conversationId) {
        return { success: false, error: 'conversationId is required' };
    }
    if (!input.text && !input.template) {
        return { success: false, error: 'text or template is required' };
    }
    if (input.text && input.template) {
        return { success: false, error: 'text and template are mutually exclusive' };
    }

    const { channelId, error: channelError } = await resolveBirdChannel(input.channel ?? 'whatsapp');
    if (channelError || !channelId) {
        return { success: false, error: channelError ?? 'Unknown channel' };
    }

    const url = `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/conversations/${input.conversationId}/messages`;
    const payload: Record<string, unknown> = {
        participantId: channelId,
        participantType: 'flow',
    };
    if (input.text) {
        payload.body = { type: 'text', text: { text: input.text } };
    } else if (input.template) {
        payload.template = input.template;
    }
    if (input.recipientPhone) {
        payload.recipients = [{
            type: 'to',
            identifierKey: 'phonenumber',
            identifierValue: normalizePhone(input.recipientPhone),
        }];
    }

    return makeBirdRequest<BirdSendMessageResponse>(url, payload, 'Conversation message');
}

/**
 * Bird's 409 ConflictError schema is `{ code, message, details }` where
 * `details` is documented as a free-form object.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

function extractConflictingConversationId(body: unknown): string | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const root = body as Record<string, unknown>;
    const details = (root.details ?? {}) as Record<string, unknown>;

    const namedCandidates: unknown[] = [
        details.conversationId,
        details.id,
        details.conflictingResource,
        details.resource,
        details.existingConversationId,
    ];
    for (const c of namedCandidates) {
        if (isUuid(c)) return c;
    }
    // Fallback: scan every value in `details` since the schema is free-form.
    for (const v of Object.values(details)) {
        if (isUuid(v)) return v;
    }
    return undefined;
}

/**
 * Create a fresh Bird conversation seeded with an initial message
 * (`POST /workspaces/{ws}/conversations`). Bird requires an `initialMessage` —
 * pass either `text` or a pre-built `template` payload.
 */
export async function createConversation(input: {
    channel?: 'whatsapp' | 'sms';
    phone: string;
    name: string;
    text?: string;
    template?: TemplateBody;
    attributes?: Record<string, string>;
}): Promise<ConversationResult> {
    if (!input.text && !input.template) {
        return { success: false, error: 'text or template is required for initialMessage' };
    }
    if (input.text && input.template) {
        return { success: false, error: 'text and template are mutually exclusive' };
    }

    const { channelId, error: channelError } = await resolveBirdChannel(input.channel ?? 'whatsapp');
    if (channelError || !channelId) {
        return { success: false, error: channelError ?? 'Unknown channel' };
    }

    const phone = normalizePhone(input.phone);
    const recipients = [{
        type: 'to',
        identifierKey: 'phonenumber',
        identifierValue: phone,
    }];
    const initialMessage: Record<string, unknown> = { recipients };
    if (input.text) {
        initialMessage.body = { type: 'text', text: { text: input.text } };
    } else if (input.template) {
        initialMessage.template = input.template;
    }

    const payload = {
        name: input.name,
        channelId,
        participants: [{
            type: 'contact',
            identifierKey: 'phonenumber',
            identifierValue: phone,
        }],
        initialMessage,
        ...(input.attributes ? { attributes: input.attributes } : {}),
    };

    const url = `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/conversations`;
    const result = await makeBirdRequest<BirdCreateConversationResponse>(url, payload, 'Create conversation');
    if (!result.success) {
        if (result.status === 409) {
            const existingId = extractConflictingConversationId(result.errorBody);
            if (existingId) {
                console.log(
                    `Bird create-conversation: 409 for ${phone} — existing conversation is ${existingId}`,
                );
                return {
                    success: false,
                    error: result.error,
                    conversationId: existingId,
                    alreadyExisted: true,
                };
            }
            console.error(
                'Bird create-conversation: 409 received but existing conversation ID not found in response',
                result.errorBody,
            );
        }
        return { success: false, error: result.error };
    }

    const data = result.data ?? {};
    const conversationId: string | undefined =
        data?.id ?? data?.conversationId ?? data?.conversation?.id;
    const messageId: string | undefined =
        data?.initialMessage?.id ?? data?.lastMessage?.id ?? data?.messageId;

    if (!conversationId) {
        console.error('Bird create-conversation: response missing conversation id', data);
        return { success: false, error: 'Bird response missing conversation id' };
    }

    return { success: true, conversationId, messageId };
}

type CreateOrUpdateConversationInput = { phone: string } & (
    | {
        notificationType: 'beforeMeeting' | 'afterMeeting';
        params: WhatsAppTemplateParams;
        notificationDeliveryId: string;
    }
    | {
        notificationType: 'welcome';
        params: WelcomeTemplateParams;
    }
);

/**
 * Send a WhatsApp template, automatically routing through the most recent Bird
 * conversation associated with this phone if we have one on file; otherwise
 * creates a fresh Bird conversation.
 */
export async function createOrUpdateConversation(input: CreateOrUpdateConversationInput): Promise<ConversationResult> {
    if (process.env.SIMULATE_WHATSAPP_UNAVAILABLE) {
        console.log(`[Simulated] WhatsApp unavailable for ${input.phone}, will fall back to SMS`);
        return { success: false, error: 'Simulated: WhatsApp unavailable' };
    }

    const credentialsCheck = checkCredentials(env.BIRD_WHATSAPP_CHANNEL_ID, 'WhatsApp');
    if (!credentialsCheck.configured) {
        return { success: false, error: credentialsCheck.error };
    }

    const { template, error: templateError } = constructTemplate(
        input.notificationType === 'welcome'
            ? { type: 'welcome', params: input.params }
            : { type: input.notificationType, params: input.params }
    );
    if (templateError || !template) {
        return { success: false, error: templateError };
    }

    const existingConversationId = await findRecentConversationIdByPhone(input.phone, 'whatsapp');
    if (existingConversationId) {
        const result = await sendConversationMessage({
            conversationId: existingConversationId,
            channel: 'whatsapp',
            template,
            recipientPhone: input.phone,
        });
        return {
            success: result.success,
            error: result.error,
            conversationId: result.success ? existingConversationId : undefined,
            messageId: result.messageId,
            created: false,
        };
    }

    const name = input.notificationType === 'welcome'
        ? `Welcome ${normalizePhone(input.phone)}`
        : `Notification ${input.notificationType} ${input.notificationDeliveryId}`;
    const attributes: Record<string, string> = input.notificationType === 'welcome'
        ? { type: 'welcome' }
        : { notificationDeliveryId: input.notificationDeliveryId };

    const result = await createConversation({
        channel: 'whatsapp',
        phone: input.phone,
        name,
        template,
        attributes,
    });

    if (result.alreadyExisted && result.conversationId) {
        const sendResult = await sendConversationMessage({
            conversationId: result.conversationId,
            channel: 'whatsapp',
            template,
            recipientPhone: input.phone,
        });
        return {
            success: sendResult.success,
            error: sendResult.error,
            conversationId: result.conversationId,
            messageId: sendResult.messageId,
            created: false,
        };
    }

    return { ...result, created: true };
}

/**
 * Send SMS message via Bird API as fallback
 */
export async function sendSMSMessage(
    phoneNumber: string,
    message: string
): Promise<OutboundSendResult> {
    const credentialsCheck = checkCredentials(env.BIRD_SMS_CHANNEL_ID, 'SMS');
    if (!credentialsCheck.configured) {
        console.error('Bird SMS credentials not configured');
        return { success: false, error: credentialsCheck.error };
    }

    const payload = {
        receiver: {
            contacts: [
                {
                    identifierValue: normalizePhone(phoneNumber)
                }
            ]
        },
        body: {
            type: 'text',
            text: {
                text: message
            }
        }
    };

    return makeBirdRequest<BirdSendMessageResponse>(
        `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_SMS_CHANNEL_ID}/messages`,
        payload,
        'SMS'
    );
}

