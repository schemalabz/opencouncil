import * as z from 'zod';
import { vmsg } from './messages';
import { ISO_DATE_OR_DATE_TIME_RULE, isoDateOrDateTime } from './dates';

// Rank of a person in the election result of a body
export const electedOrderSchema = z.number().int().nonnegative().nullable();

// A blank title is no title: a plain member has a role without a name.
export const roleTitleSchema = z.string().nullable().optional().transform(value => value?.trim() || null);

export const roleDateSchema = isoDateOrDateTime()
    .meta({ description: ISO_DATE_OR_DATE_TIME_RULE })
    .nullable()
    .optional()
    .transform(value => value ? new Date(value) : null);

// Field rules of a role — validation only, no defaults. How a role names its
// party or body differs per caller: by id in the person routes, by name in
// the city import.
export const baseRoleFields = {
    name: roleTitleSchema,
    name_en: roleTitleSchema,
    isHead: z.boolean().optional(),
    startDate: roleDateSchema,
    endDate: roleDateSchema,
    electedOrder: electedOrderSchema.optional(),
};

// A role can end without a known start, but it cannot end before it starts.
// Use as `.refine(roleDatesInOrder, roleDatesInOrderIssue)`.
export function roleDatesInOrder(role: { startDate: Date | null; endDate: Date | null }): boolean {
    return !role.startDate || !role.endDate || role.endDate >= role.startDate;
}

export const roleDatesInOrderIssue = { error: vmsg('roleEndBeforeStart'), path: ['endDate'] };

type RolePeriod = { startDate: Date | null; endDate: Date | null };

/**
 * Whether two roles hold at the same moment. A role holds from its start up to,
 * not including, its end, as `isRoleActiveAt` reads it: a role that ends on the
 * day the next one starts does not overlap it. No start means since always, and
 * no end means still current.
 */
export function rolePeriodsOverlap(a: RolePeriod, b: RolePeriod): boolean {
    const start = (role: RolePeriod) => role.startDate?.getTime() ?? -Infinity;
    const end = (role: RolePeriod) => role.endDate?.getTime() ?? Infinity;
    return start(a) < end(b) && start(b) < end(a);
}

/** JSON body of POST /roles/elected-order: the elected order of the members of one body. */
export const electedOrderRequestSchema = z.object({
    administrativeBodyId: z.string().min(1),
    rankings: z.array(z.object({
        roleId: z.string().min(1),
        electedOrder: electedOrderSchema,
    })),
});
