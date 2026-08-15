"use server";

import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';

/**
 * Data layer for the Notis release panel. Rollout state is one column —
 * User.notisEnabledAt — flipped here and read by Notis through the notis_*
 * views. Eligible = could be served by Notis: has a phone and at least one
 * notification preference with phone delivery on.
 */

const ELIGIBLE = {
    phone: { not: null },
    notificationPreferences: { some: { notifyByPhone: true } },
} as const;

export interface NotisRolloutUser {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    notisEnabledAt: Date | null;
    cityNames: string[];
}

export async function getNotisRolloutOverview(): Promise<{ eligible: number; enabled: number }> {
    await withUserAuthorizedToEdit({});
    const [eligible, enabled] = await Promise.all([
        prisma.user.count({ where: ELIGIBLE }),
        prisma.user.count({ where: { notisEnabledAt: { not: null } } }),
    ]);
    return { eligible, enabled };
}

/**
 * Eligible users plus anyone already enabled (an enabled user who dropped a
 * preference must stay visible so the flag can be reverted).
 */
export async function getNotisRolloutUsers(params: {
    search?: string;
    page: number;
    pageSize: number;
}): Promise<{ users: NotisRolloutUser[]; total: number }> {
    await withUserAuthorizedToEdit({});
    const { search, page, pageSize } = params;

    const where = {
        OR: [ELIGIBLE, { notisEnabledAt: { not: null } }],
        ...(search
            ? {
                AND: [
                    {
                        OR: [
                            { name: { contains: search, mode: 'insensitive' as const } },
                            { email: { contains: search, mode: 'insensitive' as const } },
                            { phone: { contains: search } },
                        ],
                    },
                ],
            }
            : {}),
    };

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                notisEnabledAt: true,
                notificationPreferences: { select: { city: { select: { name: true } } } },
            },
            orderBy: [{ notisEnabledAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.user.count({ where }),
    ]);

    return {
        users: users.map(({ notificationPreferences, ...user }) => ({
            ...user,
            cityNames: notificationPreferences.map((p) => p.city.name),
        })),
        total,
    };
}

export async function setNotisEnabled(userId: string, enabled: boolean): Promise<void> {
    await withUserAuthorizedToEdit({});
    await prisma.user.update({
        where: { id: userId },
        data: { notisEnabledAt: enabled ? new Date() : null },
    });
}

/**
 * «Enable next N»: pick N random eligible not-yet-enabled users, clamped to
 * however many remain. The flip writes the timestamp and nothing else — the
 * matching engine stops their old WhatsApp path immediately, and Notis
 * enrolls them on its next poll.
 */
export async function enableNextBatch(n: number): Promise<{ enabled: number; remaining: number }> {
    await withUserAuthorizedToEdit({});
    if (!Number.isInteger(n) || n <= 0) {
        throw new Error('Batch size must be a positive integer');
    }

    const candidates = await prisma.user.findMany({
        where: { AND: [ELIGIBLE, { notisEnabledAt: null }] },
        select: { id: true },
    });

    // Fisher-Yates, then take the head — unbiased for any n.
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const picked = candidates.slice(0, Math.min(n, candidates.length));

    if (picked.length > 0) {
        await prisma.user.updateMany({
            where: { id: { in: picked.map((u) => u.id) } },
            data: { notisEnabledAt: new Date() },
        });
    }

    return { enabled: picked.length, remaining: candidates.length - picked.length };
}
