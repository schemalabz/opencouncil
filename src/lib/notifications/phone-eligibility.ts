import { normalizeMobilePhone } from '@/lib/utils/phone';

/** Why a user with a phone cannot be released to Notis, or should wait. */
export type RolloutPhoneIssue = 'invalid' | 'landline' | 'duplicate' | 'us';

/** Badge copy for the release panel (an admin surface, English like the rest of it). */
export const ROLLOUT_PHONE_ISSUE_LABELS: Record<RolloutPhoneIssue, string> = {
    invalid: 'invalid number',
    landline: 'landline',
    duplicate: 'shared with another account',
    us: '+1: cold sends blocked',
};

export interface PhoneHolder {
    id: string;
    phone: string | null;
    notisEnabledAt: Date | null;
}

/**
 * One pass over every candidate. The number must parse as a mobile, and no
 * other account may hold it: a second subscription on one handset doubles
 * every send and makes inbound routing a coin toss. When two accounts share
 * a number, the one already enabled keeps its standing and the others are
 * marked duplicate.
 *
 * `us` is a wait, not a refusal: Meta refuses marketing-category templates
 * to +1 numbers (error 131049), so a batch skips them until the utility
 * shells land; an operator can still enable one by hand, and replies inside
 * the 24h window reach them today.
 */
export function assessRolloutPhones(users: PhoneHolder[]): Map<string, RolloutPhoneIssue | null> {
    const verdicts = new Map<string, { e164: string } | Exclude<RolloutPhoneIssue, 'duplicate' | 'us'>>();
    const holdersByNumber = new Map<string, PhoneHolder[]>();
    for (const user of users) {
        const parsed = normalizeMobilePhone(user.phone);
        if (!parsed.ok) {
            verdicts.set(user.id, parsed.reason === 'landline' ? 'landline' : 'invalid');
            continue;
        }
        verdicts.set(user.id, { e164: parsed.e164 });
        holdersByNumber.set(parsed.e164, [...(holdersByNumber.get(parsed.e164) ?? []), user]);
    }

    const issues = new Map<string, RolloutPhoneIssue | null>();
    for (const user of users) {
        const verdict = verdicts.get(user.id);
        if (verdict === undefined || typeof verdict === 'string') {
            issues.set(user.id, verdict ?? 'invalid');
            continue;
        }
        const holders = holdersByNumber.get(verdict.e164) ?? [];
        if (holders.length > 1) {
            const enabled = holders.find((holder) => holder.notisEnabledAt !== null);
            if (!enabled || enabled.id !== user.id) {
                issues.set(user.id, 'duplicate');
                continue;
            }
        }
        issues.set(user.id, verdict.e164.startsWith('+1') ? 'us' : null);
    }
    return issues;
}

/** Could Notis serve this reader at all? A wait is still eligible. */
export function isEligiblePhone(issue: RolloutPhoneIssue | null): boolean {
    return issue === null || issue === 'us';
}

/** May «enable next N» pick this reader? Only a clean number. */
export function isBatchablePhone(issue: RolloutPhoneIssue | null): boolean {
    return issue === null;
}
