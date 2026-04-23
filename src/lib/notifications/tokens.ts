"use server";
import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '@/env.mjs';

interface UnsubscribeTokenData {
    userId: string;
    cityId: string;
    exp: number;
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function generateUnsubscribeToken(userId: string, cityId: string): Promise<string> {
    const data: UnsubscribeTokenData = {
        userId,
        cityId,
        exp: Date.now() + TOKEN_TTL_MS,
    };

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

export async function buildUnsubscribeUrl(userId: string, cityId: string, locale: string = 'el'): Promise<string> {
    const token = await generateUnsubscribeToken(userId, cityId);
    return `${env.NEXTAUTH_URL}/${locale}/unsubscribe?token=${encodeURIComponent(token)}`;
}
