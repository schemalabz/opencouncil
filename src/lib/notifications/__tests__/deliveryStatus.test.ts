import type { NotificationDeliveryStatus } from '@prisma/client';
import {
    NotificationOverallStatus,
    classifyDeliveries,
    deliveriesWhereForStatus,
} from '../deliveryStatus';

/**
 * The rule lives twice — once as a JS classifier (the stats), once as a
 * Prisma where-fragment (the filter). This test evaluates the fragment's
 * semantics in JS over every delivery combination up to length 3 and checks
 * it selects exactly the combinations the classifier labels with that
 * status. Before the shared rule, the two halves disagreed: a
 * [sent, skipped] notification matched the skipped FILTER but classified as
 * sent — filtering by "Skipped" showed rows whose badge said sent.
 */

const STATUSES: NotificationDeliveryStatus[] = ['pending', 'sent', 'failed', 'skipped'];
const OVERALL: NotificationOverallStatus[] = ['pending', 'failed', 'skipped', 'sent'];

/** All multisets of delivery statuses with 0..3 entries. */
function combos(): NotificationDeliveryStatus[][] {
    const out: NotificationDeliveryStatus[][] = [[]];
    for (const a of STATUSES) {
        out.push([a]);
        for (const b of STATUSES) {
            out.push([a, b]);
            for (const c of STATUSES) out.push([a, b, c]);
        }
    }
    return out;
}

/** Evaluate one deliveries-condition ({some}/{none} with status matchers). */
function evalDeliveriesCond(
    cond: { some?: { status: unknown }; none?: { status?: unknown } },
    statuses: NotificationDeliveryStatus[],
): boolean {
    const matches = (m: unknown, s: NotificationDeliveryStatus): boolean => {
        if (typeof m === 'string') return s === m;
        const o = m as { not?: string; in?: string[] };
        if (o.not !== undefined) return s !== o.not;
        if (o.in !== undefined) return o.in.includes(s);
        throw new Error(`unhandled matcher ${JSON.stringify(m)}`);
    };
    if (cond.some) return statuses.some(s => matches(cond.some!.status, s));
    if (cond.none) {
        if (cond.none.status === undefined) return statuses.length === 0;
        return !statuses.some(s => matches(cond.none!.status, s));
    }
    throw new Error(`unhandled condition ${JSON.stringify(cond)}`);
}

/** Evaluate the where-fragment shape deliveriesWhereForStatus produces. */
function evalWhere(where: Record<string, unknown>, statuses: NotificationDeliveryStatus[]): boolean {
    if (where.AND) {
        return (where.AND as Array<Record<string, unknown>>).every(w => evalWhere(w, statuses));
    }
    if (where.deliveries) {
        return evalDeliveriesCond(
            where.deliveries as Parameters<typeof evalDeliveriesCond>[0],
            statuses,
        );
    }
    throw new Error(`unhandled where ${JSON.stringify(where)}`);
}

describe('notification overall status — one rule, two halves', () => {
    it('classifies with the documented precedence', () => {
        expect(classifyDeliveries([])).toBe('skipped');
        expect(classifyDeliveries(['skipped'])).toBe('skipped');
        expect(classifyDeliveries(['sent', 'skipped'])).toBe('sent');
        expect(classifyDeliveries(['pending', 'failed'])).toBe('pending');
        expect(classifyDeliveries(['failed', 'sent'])).toBe('failed');
        expect(classifyDeliveries(['sent'])).toBe('sent');
    });

    it('the SQL filter selects exactly what the classifier labels, for every combination', () => {
        for (const statuses of combos()) {
            const label = classifyDeliveries(statuses);
            for (const filter of OVERALL) {
                const selected = evalWhere(
                    deliveriesWhereForStatus(filter) as Record<string, unknown>,
                    statuses,
                );
                expect({ statuses, filter, selected }).toEqual({
                    statuses,
                    filter,
                    selected: label === filter,
                });
            }
        }
    });
});
