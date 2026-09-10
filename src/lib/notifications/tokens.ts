import "server-only";
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '@/env.mjs';
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

    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = createHmac('sha256', env.NEXTAUTH_SECRET)
        .update(payload)
        .digest('base64url');

    return `${payload}.${signature}`;
}

export async function verifyUnsubscribeToken(token: string): Promise<UnsubscribeTokenData | null> {
    try {
        const [payload, signature] = token.split('.');
        if (!payload || !signature) return null;

        const expectedSignature = createHmac('sha256', env.NEXTAUTH_SECRET)
            .update(payload)
            .digest('base64url');

        const sigBuf = new Uint8Array(Buffer.from(signature, 'base64url'));
        const expectedBuf = new Uint8Array(Buffer.from(expectedSignature, 'base64url'));
        if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

        const data: UnsubscribeTokenData = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf-8')
        );

        if (Date.now() > data.exp) return null;

        return data;
    } catch {
        return null;
    }
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
