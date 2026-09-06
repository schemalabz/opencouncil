import type { NotisClientResult, NotisSubscriptionView } from '@/lib/notis/client';

/**
 * The reader's WhatsApp channel as the pages show it. Notis owns the
 * subscription, so its answer is the truth whenever it has one; the reader's
 * own request (User.notifyByPhone, the flag the poller enrolls on) speaks
 * only for a reader Notis has not met. Pure, so the signup, the profile
 * switch and the city page apply one rule, and tests need no Notis.
 */

/**
 * What Notis says about a reader: a subscription's status, `null` when he
 * has none (or there is no Notis to ask), `unknown` when he did not answer
 * — which is not the same as none.
 */
export type NotisStatus = 'active' | 'unsubscribed' | 'unknown' | null;

/** A Notis client answer as a status; no answer (nobody asked) is `null`. */
export function notisStatusOf(result: NotisClientResult<NotisSubscriptionView | null> | null): NotisStatus {
    if (!result) return null;
    if (result.ok) return result.data?.status ?? null;
    return result.reason === 'unconfigured' ? null : 'unknown';
}

/** The same, from the profile switch's read (`getNotisChannelState`). */
export function notisStatusFromChannelState(state: {
    configured: boolean;
    reachable: boolean;
    subscription: { status: 'active' | 'unsubscribed' } | null;
}): NotisStatus {
    if (!state.configured) return null;
    if (!state.reachable) return 'unknown';
    return state.subscription?.status ?? null;
}

/**
 * Whether the channel is on: Notis decides when it knows the reader, the
 * reader's request decides when it does not, and `null` means nobody can
 * say right now (Notis did not answer).
 */
export function phoneChannelFor(notisStatus: NotisStatus, notifyByPhone: boolean): boolean | null {
    switch (notisStatus) {
        case 'active':
            return true;
        case 'unsubscribed':
            return false;
        case 'unknown':
            return null;
        case null:
            return notifyByPhone;
    }
}
