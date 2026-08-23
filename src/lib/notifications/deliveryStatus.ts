import type { NotificationDeliveryStatus, Prisma } from '@prisma/client';

/**
 * The ONE rule for a notification's overall status, derived from its
 * deliveries. The admin page uses it twice — the stats classify in JS, the
 * list filters in SQL — and the two halves must agree, or filtering by
 * "skipped" surfaces rows whose badge says "sent". A unit test enumerates
 * delivery combinations and checks both halves against each other.
 *
 * Precedence: any pending → pending; else any failed → failed; else all
 * deliveries skipped (or none at all — nothing was ever dispatched, e.g. a
 * phone-only user on the Notis rollout) → skipped; else sent.
 */
export type NotificationOverallStatus = 'pending' | 'failed' | 'skipped' | 'sent';

export function classifyDeliveries(
    statuses: NotificationDeliveryStatus[],
): NotificationOverallStatus {
    if (statuses.includes('pending')) return 'pending';
    if (statuses.includes('failed')) return 'failed';
    if (statuses.every(s => s === 'skipped')) return 'skipped';
    return 'sent';
}

/**
 * The SQL half: a where-fragment matching exactly the notifications
 * `classifyDeliveries` would label `status`. Each case mirrors the
 * precedence above, not just "has one delivery like this" — a
 * [pending, failed] notification is pending, so it must not match the
 * failed filter.
 */
export function deliveriesWhereForStatus(
    status: NotificationOverallStatus,
): Prisma.NotificationWhereInput {
    switch (status) {
        case 'pending':
            return { deliveries: { some: { status: 'pending' } } };
        case 'failed':
            return {
                AND: [
                    { deliveries: { none: { status: 'pending' } } },
                    { deliveries: { some: { status: 'failed' } } },
                ],
            };
        case 'skipped':
            // "Every delivery is skipped" — which also covers zero deliveries
            // (none over an empty set holds) and excludes pending/failed by
            // the enum: any other status is a non-skipped delivery.
            return { deliveries: { none: { status: { not: 'skipped' } } } };
        case 'sent':
            return {
                AND: [
                    { deliveries: { none: { status: { in: ['pending', 'failed'] } } } },
                    { deliveries: { some: { status: { not: 'skipped' } } } },
                ],
            };
    }
}
