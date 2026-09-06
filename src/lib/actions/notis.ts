"use server";

import { getCurrentUser } from "@/lib/auth";
import { getPhoneChannelState, setNotifyByPhoneForUser } from "@/lib/db/notifications";
import {
    getNotisSubscription,
    isNotisConfigured,
    setNotisSubscription,
    type NotisSubscriptionView,
} from "@/lib/notis/client";

/**
 * The signed-in reader's Νότης channel, as the profile switch and the
 * signup's delivery step see it. Notis owns the subscription status; this
 * app keeps notifyByPhone, which gates enrollment and the proactive
 * audience. The two are kept aligned here, on the reader's explicit action.
 */

export interface NotisChannelState {
    /** Whether this deployment can reach Notis at all (NOTIS_API_URL + token). */
    configured: boolean;
    /** Whether Notis answered; false leaves `subscription` unknown, not empty. */
    reachable: boolean;
    subscription: NotisSubscriptionView | null;
    /** The reader's WhatsApp/SMS consent (User.notifyByPhone). */
    notifyByPhone: boolean;
    phone: string | null;
}

export type SetNotisEnabledResult =
    | {
          ok: true;
          enabled: boolean;
          /** false when Notis could not be told — the flags are written either way. */
          synced: boolean;
          subscription: NotisSubscriptionView | null;
      }
    | { ok: false; code: "unauthenticated" | "no_phone" | string };

/** Null when nobody is signed in. */
export async function getNotisChannelState(): Promise<NotisChannelState | null> {
    const user = await getCurrentUser();
    if (!user) return null;
    const [channel, notis] = await Promise.all([
        getPhoneChannelState(user.id),
        getNotisSubscription(user.id),
    ]);
    return {
        configured: isNotisConfigured(),
        reachable: notis.ok,
        subscription: notis.ok ? notis.data : null,
        notifyByPhone: channel.notifyByPhone,
        phone: channel.phone,
    };
}

/**
 * Switch the reader's WhatsApp channel on or off: the profile's switch and
 * the signup's card, which are the same consent.
 *
 * Off writes the flag first — the fan-out audience filter mutes proactive
 * wakes this tick — and then tells Notis, best-effort. On asks Notis first,
 * because a refusal (a number another reader holds, no usable mobile) must
 * not leave the flag claiming a channel that does not exist; a reader with
 * no subscription is left to the poller, which enrolls on notifyByPhone.
 */
export async function setNotisEnabled(enabled: boolean): Promise<SetNotisEnabledResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, code: "unauthenticated" };

    if (!enabled) {
        await setNotifyByPhoneForUser(user.id, false);
        const result = await setNotisSubscription(user.id, "unsubscribed");
        return {
            ok: true,
            enabled: false,
            synced: result.ok,
            subscription: result.ok ? result.data.subscription : null,
        };
    }

    const { phone } = await getPhoneChannelState(user.id);
    if (!phone) return { ok: false, code: "no_phone" };
    const result = await setNotisSubscription(user.id, "active");
    if (!result.ok && result.reason === "rejected") {
        return { ok: false, code: result.code ?? `notis_${result.status}` };
    }
    await setNotifyByPhoneForUser(user.id, true);
    return {
        ok: true,
        enabled: true,
        synced: result.ok,
        subscription: result.ok ? result.data.subscription : null,
    };
}
