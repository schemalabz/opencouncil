"use server";

import prisma from './prisma';

/**
 * Audience for product-update emails: every non-super-admin user who hasn't
 * opted out of product updates (`allowProductUpdates`).
 */
export interface ProductUpdateRecipient {
    email: string;
    name: string;
    userId: string;
}

export async function getProductUpdateRecipients(): Promise<ProductUpdateRecipient[]> {
    const users = await prisma.user.findMany({
        where: {
            isSuperAdmin: false,
            allowProductUpdates: true,
        },
        select: {
            id: true,
            email: true,
            name: true,
        },
    });

    return users.map((u) => ({
        email: u.email,
        name: u.name ?? '',
        userId: u.id,
    }));
}

export async function getProductUpdateRecipientCount(): Promise<{
    optedIn: number;
    total: number;
}> {
    const [optedIn, total] = await Promise.all([
        prisma.user.count({
            where: { isSuperAdmin: false, allowProductUpdates: true },
        }),
        prisma.user.count({
            where: { isSuperAdmin: false },
        }),
    ]);
    return { optedIn, total };
}
