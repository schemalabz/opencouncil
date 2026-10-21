import type { NotificationBehavior } from '@prisma/client';

/** Whether a body's subscribers get notifications from the app at all. A meeting without a body gets none. */
export function notificationsEnabled(
    behavior: NotificationBehavior | null | undefined,
): behavior is Exclude<NotificationBehavior, 'NOTIFICATIONS_DISABLED'> {
    return !!behavior && behavior !== 'NOTIFICATIONS_DISABLED';
}
