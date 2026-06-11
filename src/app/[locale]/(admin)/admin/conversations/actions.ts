"use server";

import { withUserAuthorizedToEdit } from '@/lib/auth';
import prisma from '@/lib/db/prisma';
import {
    sendConversationMessage,
    createOrUpdateConversation,
    sendSMSMessage,
} from '@/lib/notifications/bird';
import { sendAndPersistOutbound } from '@/lib/notifications/outbound';
import { generateSmsContent, generateWelcomeSmsContent } from '@/lib/notifications/content';
import { releaseNotifications } from '@/lib/notifications/deliver';
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
// Admin "Before-meeting" test send. Creates a real Notification +
// NotificationDelivery row for a chosen user/city/meeting (mirroring the prod
// flow that `createNotificationsForMeeting` runs after the agenda task), then
// calls `releaseNotifications` so it goes through the same conversation +
// message-row pipeline as a real notification.
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

export async function sendTestBeforeMeetingNotification(input: {
    phone: string;
    cityId: string;
    meetingId: string;
}): Promise<SendReplyResult> {
    await withUserAuthorizedToEdit({});

    const phone = input.phone.trim();
    if (!phone) return { success: false, error: 'Phone number is required' };
    if (!input.cityId) return { success: false, error: 'City is required' };
    if (!input.meetingId) return { success: false, error: 'Meeting is required' };

    const user = await prisma.user.findFirst({ where: { phone } });
    if (!user) {
        return { success: false, error: `No user found with phone ${phone}` };
    }

    const firstSubject = await prisma.subject.findFirst({
        where: { councilMeetingId: input.meetingId, cityId: input.cityId },
    });
    if (!firstSubject) {
        return { success: false, error: 'Meeting has no subjects to attach' };
    }

    let notificationId: string;
    try {
        // Include the relations `generateSmsContent` needs so we can
        // pre-render the SMS body inline — same path the production flow
        // takes in `createNotificationsForMeeting`.
        const notification = await prisma.notification.create({
            data: {
                userId: user.id,
                cityId: input.cityId,
                meetingId: input.meetingId,
                type: 'beforeMeeting',
                subjects: {
                    create: [{ subjectId: firstSubject.id, reason: 'generalInterest' }],
                },
            },
            include: {
                subjects: { include: { subject: { include: { topic: true } } } },
                meeting: { include: { administrativeBody: true } },
                city: true,
            },
        });
        notificationId = notification.id;

        const smsBody = await generateSmsContent({
            id: notification.id,
            userId: notification.userId,
            cityId: notification.cityId,
            type: 'beforeMeeting',
            subjects: notification.subjects.map((ns) => ({
                id: ns.subject.id,
                name: ns.subject.name,
                description: ns.subject.description,
                topic: ns.subject.topic
                    ? { name: ns.subject.topic.name, colorHex: ns.subject.topic.colorHex }
                    : null,
            })),
            meeting: {
                dateTime: notification.meeting.dateTime,
                administrativeBody: notification.meeting.administrativeBody
                    ? { name: notification.meeting.administrativeBody.name }
                    : null,
            },
            city: { name_municipality: notification.city.name_municipality },
        });

        await prisma.notificationDelivery.create({
            data: {
                notificationId: notification.id,
                medium: 'message',
                status: 'pending',
                phone,
                body: smsBody,
            },
        });
    } catch (error: any) {
        if (error?.code === 'P2002' && error?.meta?.target?.includes('userId')) {
            return {
                success: false,
                error: 'A beforeMeeting notification already exists for this user + meeting',
            };
        }
        throw error;
    }

    const result = await releaseNotifications([notificationId]);

    if (result.failed > 0) {
        return { success: false, error: `Release failed (${result.failed} failed deliveries)` };
    }
    return { success: true };
}
