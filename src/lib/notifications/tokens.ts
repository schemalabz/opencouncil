import "server-only";
import { signPayload, verifyPayload } from '@/lib/auth/signedPayload';
import type { Realm } from '@prisma/client';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import { emailLocaleForRealm } from '@/lib/email/emailLocale';
import { urlPrefixForLocale } from '@/i18n/config';

interface UnsubscribeTokenData {
    userId: string;
    /**
     * The city the unsubscribe link is scoped to. Optional: meeting-notification
     * emails populate it (so the recipient can flip a per-city preference);
     * product-update emails leave it out (no city context).
     */
    cityId?: string;
    exp: number;
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function generateUnsubscribeToken(userId: string, cityId?: string): Promise<string> {
    const data: UnsubscribeTokenData = {
        userId,
        exp: Date.now() + TOKEN_TTL_MS,
    };
    if (cityId) data.cityId = cityId;
    return signPayload('unsubscribe', data);
}

/**
 * `allowUnkinded`: links in emails sent before 2026-09-16 carry no kind and
 * stay valid for TOKEN_TTL_MS. Drop the option after 2026-10-16. The userId
 * check is what keeps an unkinded token of another shape out.
 */
export async function verifyUnsubscribeToken(token: string): Promise<UnsubscribeTokenData | null> {
    const data = verifyPayload<UnsubscribeTokenData>('unsubscribe', token, { allowUnkinded: true });
    if (!data || typeof data.userId !== 'string' || !data.userId) return null;
    if (data.cityId !== undefined && typeof data.cityId !== 'string') return null;
    return data;
}

/**
 * Unsubscribe link for a notification about a city.
 *
 * `realm` is passed in, not looked up: this runs once per recipient in a
 * notification fan-out. Without one — a product-update broadcast — the
 * configured host and Greek stand, as before realms.
 */
export async function buildUnsubscribeUrl(
    userId: string,
    { cityId, locale, realm }: { cityId?: string; locale?: string; realm?: Realm | null } = {},
): Promise<string> {
    const token = await generateUnsubscribeToken(userId, cityId);
    // urlPrefixForLocale, not the locale id: sr-Latn is served at /lat.
    const prefix = urlPrefixForLocale(locale ?? emailLocaleForRealm(realm ?? null));
    return `${realmBaseUrl(realm)}/${prefix}/unsubscribe?token=${encodeURIComponent(token)}`;
}
