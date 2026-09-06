"use server";

import { withUserAuthorizedToEdit } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import {
    sendConversationMessage,
    createOrUpdateConversation,
    sendSMSMessage,
} from '@/lib/notifications/bird';
import { sendAndPersistOutbound } from '@/lib/notifications/outbound';
import { generateWelcomeSmsContent } from '@/lib/notifications/content';
import type { OutboundSendResult } from '@/lib/notifications/types';
import type { MessageChannel } from '@prisma/client';

export type SendReplyResult = Pick<OutboundSendResult, 'success' | 'error'>;

/**
 * Send a free-form text reply into an existing Bird conversation via the
 * Conversations API, persisting the local Message row through the lifecycle
 * (pending → sent / failed → polled terminal status).
 */
export async function sendTestReply(input: {
    conversationId: string;
    phone: string;
    text: string;
    channel: MessageChannel;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const text = input.text.trim();
    if (!text) return { success: false, error: 'Message body is required' };
    if (!input.conversationId) return { success: false, error: 'Conversation ID is required' };
    if (!input.phone) return { success: false, error: 'Phone number is required' };

    const result = await sendAndPersistOutbound({
        channel: input.channel,
        phone: input.phone,
        body: text,
        conversationId: input.conversationId,
        send: () => sendConversationMessage({
            conversationId: input.conversationId,
            channel: input.channel,
            text,
            recipientPhone: input.phone,
        }),
    });

    if (result.success && result.finalStatus !== 'failed') {
        return { success: true };
    }
    return { success: false, error: result.finalReason ?? result.error };
}

/**
 * Send a free-form SMS test to a phone via the Messaging API.
 * Persists an outbound Message row in the same shape as `sendTestTemplate`.
 */
export async function sendTestSms(input: {
    phone: string;
    body: string;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const phone = input.phone.trim();
    const body = input.body.trim();
    if (!phone) return { success: false, error: 'Phone number is required' };
    if (!body) return { success: false, error: 'Message body is required' };

    const result = await sendAndPersistOutbound({
        channel: 'sms',
        phone,
        body,
        send: () => sendSMSMessage(phone, body),
    });

    if (result.success && result.finalStatus !== 'failed') {
        return { success: true };
    }
    return { success: false, error: result.finalReason ?? result.error };
}

/**
 * Send a WhatsApp welcome template to a phone via the Messaging API. Used by
 * the admin "Send test message" dialog on `/admin/conversations` to seed a
 * conversation for testing — kicks off a thread the user can reply to.
 */
export async function sendTestTemplate(input: {
    phone: string;
    userName?: string;
    cityName?: string;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const phone = input.phone.trim();
    if (!phone) return { success: false, error: 'Phone number is required' };
    const userName = input.userName?.trim() || 'Friend';
    const cityName = input.cityName?.trim() || 'Athens';

    // Route through createOrUpdateConversation so the welcome message lands in
    // the same Bird thread we reuse for later notifications.
    const result = await sendAndPersistOutbound({
        channel: 'whatsapp',
        phone,
        body: '[welcome template]',
        send: () => createOrUpdateConversation({
            phone,
            notificationType: 'welcome',
            params: { userName, cityName },
        }),
    });
    if (result.success && result.finalStatus !== 'failed') {
        return { success: true };
    }

    // WhatsApp failed — fall back to SMS. Either the send failed, or
    // reconciliation flagged it failed post-send (24h window, blocked
    // recipient, etc.).
    const waError = result.finalReason ?? result.error;
    const smsBody = await generateWelcomeSmsContent(userName, cityName);
    const smsResult = await sendAndPersistOutbound({
        channel: 'sms',
        phone,
        body: smsBody,
        send: () => sendSMSMessage(phone, smsBody),
    });
    if (smsResult.success && smsResult.finalStatus !== 'failed') {
        return { success: true };
    }
    const smsError = smsResult.finalReason ?? smsResult.error;
    return { success: false, error: `WhatsApp: ${waError}; SMS: ${smsError}` };
}

// ---------------------------------------------------------------------------
// Admin "Before-meeting" test send. Retired with the old message path: this
// app creates no message deliveries any more, so the tool would only add a
// row that release marks skipped. The action stays as a signpost until the
// panel is rebuilt; a real wake is tested in the Notis playground.
// ---------------------------------------------------------------------------

export interface CityOption { id: string; name: string }
export interface MeetingOption { id: string; name: string; dateTime: string }

export async function listCitiesForTest(): Promise<CityOption[]> {
    await withUserAuthorizedToEdit({});
    const cities = await prisma.city.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    });
    return cities;
}

export async function listMeetingsForTest(cityId: string): Promise<MeetingOption[]> {
    await withUserAuthorizedToEdit({});
    if (!cityId) return [];
    const meetings = await prisma.councilMeeting.findMany({
        where: { cityId },
        select: { id: true, name: true, dateTime: true },
        orderBy: { dateTime: 'desc' },
        take: 20,
    });
    return meetings.map((m) => ({ ...m, dateTime: m.dateTime.toISOString() }));
}

export async function sendTestBeforeMeetingNotification(_input: {
    phone: string;
    cityId: string;
    meetingId: string;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});
    return {
        success: false,
        error:
            'WhatsApp and SMS are served by Notis now; this app sends no message deliveries. ' +
            'Test a wake in the Notis playground instead.',
    };
}
