import prisma from './prisma';
import type { Message, MessageChannel, MessageDirection, MessageStatus } from '@prisma/client';
import { normalizePhone } from '@/lib/notifications/phone';

export async function findRecentConversationIdByPhone(
    phone: string,
    channel: MessageChannel,
): Promise<string | null> {
    const formatted = normalizePhone(phone);
    const recent = await prisma.message.findFirst({
        where: {
            phone: { in: [formatted, phone] },
            channel,
            conversationId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { conversationId: true },
    });
    return recent?.conversationId ?? null;
}

export async function recordOutboundMessage(input: {
    channel: MessageChannel;
    phone: string;
    body: string;
    conversationId?: string | null;
    notificationDeliveryId?: string | null;
}): Promise<Message> {
    return prisma.message.create({
        data: {
            channel: input.channel,
            direction: 'outbound' satisfies MessageDirection,
            phone: input.phone,
            body: input.body,
            conversationId: input.conversationId ?? null,
            notificationDeliveryId: input.notificationDeliveryId ?? null,
            status: 'pending' satisfies MessageStatus,
        },
    });
}

export async function updateMessage(
    id: string,
    update: {
        status: MessageStatus;
        birdMessageId?: string | null;
        conversationId?: string | null;
        failureReason?: string | null;
    },
): Promise<Message> {
    return prisma.message.update({
        where: { id },
        data: {
            status: update.status,
            ...(update.birdMessageId !== undefined ? { birdMessageId: update.birdMessageId } : {}),
            ...(update.conversationId !== undefined ? { conversationId: update.conversationId } : {}),
            ...(update.failureReason !== undefined ? { failureReason: update.failureReason } : {}),
        },
    });
}
