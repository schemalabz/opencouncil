import 'server-only';

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
