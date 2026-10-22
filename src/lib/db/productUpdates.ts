"use server";

import prisma from './prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';

/**
 * Audience for product-update emails: every user who has consented to receive
 * them via `allowProductUpdates`. Super-admins are included — they're regular
 * users for the purposes of product updates and have opted in like anyone else.
 * Machine accounts are not people: nothing is ever sent to them, and the
 * total counts people only.
 */
export interface ProductUpdateRecipient {
    email: string;
    name: string;
    userId: string;
}

export async function getProductUpdateRecipients(): Promise<ProductUpdateRecipient[]> {
    await withUserAuthorizedToEdit({});
    const users = await prisma.user.findMany({
        where: {
            allowProductUpdates: true,
            isMachine: false,
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
    await withUserAuthorizedToEdit({});
    const [optedIn, total] = await Promise.all([
        prisma.user.count({
            where: { allowProductUpdates: true, isMachine: false },
        }),
        prisma.user.count({ where: { isMachine: false } }),
    ]);
    return { optedIn, total };
}
