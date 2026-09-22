import 'server-only';

import { getCityChannelRequest } from '@/lib/db/signup';
import { getNotisSubscription } from '@/lib/notis/client';
import { notisStatusOf, phoneChannelFor } from '@/lib/notis/phone-channel';

/**
 * The signed-in reader's WhatsApp channel for a page: one Notis read,
 * folded with their own request by the shared rule. `null` when Notis did
 * not answer, so a page shows nothing rather than a guess.
 */
export async function readerPhoneChannel(user: { id: string; notifyByPhone: boolean }): Promise<boolean | null> {
    return phoneChannelFor(notisStatusOf(await getNotisSubscription(user.id)), user.notifyByPhone);
}

/**
 * Whether one municipality's notifications still reach the reader. A request
 * is not delivery: a reader who said ΣΤΟΠ to Νότης keeps `notifyByPhone`,
 * because the flag is what they asked for and Νότης owns what became of it.
 *
 * Νότης is asked only when the answer turns on him — no request at all, or
 * an email channel that is on, settles it without a call. Silence counts as
 * "not reaching them": a reader who is on the list and sees the invitation
 * again meets a signup that says so, while one who gets nothing and sees no
 * invitation has no way back.
 */
export async function readerSubscribedToCity(userId: string, cityId: string): Promise<boolean> {
    const request = await getCityChannelRequest(userId, cityId);
    if (!request) return false;
    if (request.notifyByEmail) return true;
    return (await readerPhoneChannel({ id: userId, notifyByPhone: request.notifyByPhone })) === true;
}
