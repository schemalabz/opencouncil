"use server";

import { getCurrentUser } from "@/lib/auth";
import { getPhoneChannelState, setNotifyByPhoneForUser } from "@/lib/db/notifications";
import {
    getNotisSubscription,
    isNotisConfigured,
    setNotisSubscription,
    type NotisClientResult,
    type NotisSubscriptionView,
} from "@/lib/notis/client";

/**
 * The signed-in reader's Νότης channel, as the profile switch and the
 * signup's delivery step see it. Notis owns the subscription and is the
 * truth the pages show; this app keeps User.notifyByPhone as the reader's
 * request, which the poller enrolls on and the proactive audience filters
 * by. The request follows Notis's confirmed answers: a flip Notis did not
 * confirm is refused, never written on this side alone.
 */

export interface NotisChannelState {
    /** Whether this deployment can reach Notis at all (NOTIS_API_URL + token). */
    configured: boolean;
    /** Whether Notis answered; false leaves `subscription` unknown, not empty. */
    reachable: boolean;
    subscription: NotisSubscriptionView | null;
    /** The reader's WhatsApp/SMS request (User.notifyByPhone). */
    notifyByPhone: boolean;
    phone: string | null;
}

export type SetNotisEnabledResult =
    | { ok: true; enabled: boolean; subscription: NotisSubscriptionView | null }
    | { ok: false; code: "unauthenticated" | "no_phone" | "notis_unreachable" | string };

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
 * A refused or silent Notis call, as the code the reader's surface shows.
 * Only a refusal Notis explains by code is the reader's to act on; everything
 * else — a timeout, a 5xx from a proxy, a body that is not the API's — is an
 * outage, and the surfaces offer a retry for that.
 */
function refusalCode(result: Exclude<NotisClientResult<unknown>, { ok: true }>): string {
    if (result.reason === "rejected" && result.code) return result.code;
    return "notis_unreachable";
}

/**
 * Switch the reader's WhatsApp channel on or off: the profile's switch and
 * the signup's card, which are the same consent.
 *
 * Notis is asked first, both ways. Off that Notis did not confirm leaves
 * everything as it was and tells the reader to try again — a request this
 * app turned off alone would stand against a subscription Notis still
 * serves. On needs a number, and a refusal (a number another reader holds,
 * no usable mobile) must not leave the request claiming a channel that
 * does not exist; a reader with no subscription is left to the poller,
 * which enrolls on the request. Without Notis configured (a preview), the
 * request is all there is.
 */
export async function setNotisEnabled(enabled: boolean): Promise<SetNotisEnabledResult> {
    const user = await getCurrentUser();
    if (!user) return { ok: false, code: "unauthenticated" };

    if (enabled) {
        const { phone } = await getPhoneChannelState(user.id);
        if (!phone) return { ok: false, code: "no_phone" };
    }

    let subscription: NotisSubscriptionView | null = null;
    if (isNotisConfigured()) {
        const result = await setNotisSubscription(user.id, enabled ? "active" : "unsubscribed");
        if (!result.ok) return { ok: false, code: refusalCode(result) };
        subscription = result.data.subscription;
    }
    await setNotifyByPhoneForUser(user.id, enabled);
    return { ok: true, enabled, subscription };
}
