"use server";

import prisma from '@/lib/db/prisma';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import {
    type RolloutPhoneIssue,
    assessRolloutPhones,
    isBatchablePhone,
    isEligiblePhone,
} from '@/lib/notifications/phone-eligibility';

/**
 * Data layer for the Notis release panel. Rollout state is one column —
 * User.notisEnabledAt — flipped here and read by Notis through the notis_*
 * views. Eligible = could be served by Notis: a mobile number the rule in
 * @/lib/phone accepts, held by no other account, and phone delivery on in
 * at least one city. The phone verdict is computed in code (the rule is
 * TypeScript, not SQL), over the few hundred users who have a phone at all.
 */

const HAS_PHONE_DELIVERY = {
    phone: { not: null },
    // '' passes IS NOT NULL but reaches nobody, and
    // createNotificationsForMeeting's truthiness test already agrees.
    NOT: { phone: '' },
    notificationPreferences: { some: { notifyByPhone: true } },
} as const;

export interface NotisRolloutUser {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    notisEnabledAt: Date | null;
    cityNames: string[];
    /** Why this user is not in a batch — or null when the number is clean. */
    phoneIssue: RolloutPhoneIssue | null;
}

interface Candidate {
    id: string;
    notisEnabledAt: Date | null;
    hasPhoneDelivery: boolean;
    issue: RolloutPhoneIssue | null;
}

/**
 * Everyone who holds a phone, plus anyone already enabled (who must stay
 * visible so the flag can be reverted), with the phone verdict attached.
 * The set is wider than the panel shows on purpose: User.phone is not
 * unique, and an account with no phone delivery can hold a candidate's
 * number, so a duplicate is only visible across every holder. The list
 * page reads this too rather than judging one page.
 */
async function loadCandidates(): Promise<Candidate[]> {
    const rows = await prisma.user.findMany({
        where: {
            OR: [
                { phone: { not: null }, NOT: { phone: '' } },
                { notisEnabledAt: { not: null } },
            ],
        },
        select: {
            id: true,
            phone: true,
            notisEnabledAt: true,
            notificationPreferences: { where: { notifyByPhone: true }, select: { id: true }, take: 1 },
        },
    });
    const issues = assessRolloutPhones(rows);
    return rows.map((row) => ({
        id: row.id,
        notisEnabledAt: row.notisEnabledAt,
        hasPhoneDelivery: Boolean(row.phone) && row.notificationPreferences.length > 0,
        issue: issues.get(row.id) ?? null,
    }));
}

const isEligible = (c: Candidate) => c.hasPhoneDelivery && isEligiblePhone(c.issue);
const isBatchable = (c: Candidate) =>
    c.hasPhoneDelivery && c.notisEnabledAt === null && isBatchablePhone(c.issue);

export async function getNotisRolloutOverview(): Promise<{
    eligible: number;
    enabled: number;
    // Counted directly, not derived as eligible - enabled: an enabled user
    // who later dropped a preference is in `enabled` but not in `eligible`,
    // and the subtraction would undercount the real batch pool. The pool
    // also leaves out the numbers a batch must not pick (see isBatchable).
    remaining: number;
}> {
    await withUserAuthorizedToEdit({});
    const candidates = await loadCandidates();
    return {
        eligible: candidates.filter(isEligible).length,
        enabled: candidates.filter((c) => c.notisEnabledAt !== null).length,
        remaining: candidates.filter(isBatchable).length,
    };
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
        OR: [HAS_PHONE_DELIVERY, { notisEnabledAt: { not: null } }],
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

    const [users, total, candidates] = await Promise.all([
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
        loadCandidates(),
    ]);
    const issueOf = new Map(candidates.map((c) => [c.id, c.issue]));

    return {
        users: users.map(({ notificationPreferences, ...user }) => ({
            ...user,
            cityNames: notificationPreferences.map((p) => p.city.name),
            phoneIssue: issueOf.get(user.id) ?? null,
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
 * «Enable next N»: pick N random batchable not-yet-enabled users, clamped to
 * however many remain. The flip writes the timestamp and nothing else — the
 * matching engine stops their old WhatsApp path immediately, and Notis
 * enrolls them on its next poll.
 */
export async function enableNextBatch(n: number): Promise<{ enabled: number; remaining: number }> {
    await withUserAuthorizedToEdit({});
    if (!Number.isInteger(n) || n <= 0) {
        throw new Error('Batch size must be a positive integer');
    }

    const candidates = (await loadCandidates()).filter(isBatchable);

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
