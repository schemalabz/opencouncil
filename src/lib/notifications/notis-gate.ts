import prisma from '@/lib/db/prisma';
import { normalizePhone } from '@/lib/notifications/phone';

/**
 * During the Notis rollout, two Bird webhook subscriptions receive every
 * conversation event: this app's and the notis service's. A user with
 * notisEnabledAt set is served by notis — this app must neither reply to
 * their inbound messages (double answer) nor persist notis's outbound
 * traffic as Message rows. Stored phone formats are mixed (with or without
 * the leading '+'), so the lookup tolerates both.
 */
export async function isNotisServedPhone(phone: string | undefined): Promise<boolean> {
    const normalized = normalizePhone(phone);
    if (!normalized) return false;
    const user = await prisma.user.findFirst({
        where: {
            phone: { in: [normalized, normalized.slice(1)] },
            notisEnabledAt: { not: null },
        },
        select: { id: true },
    });
    return Boolean(user);
}
