// Not yet used - will be used to unsubscribe from notifications
"use server";

import { createHmac } from 'crypto';
import { env } from '@/env.mjs';

interface UnsubscribeTokenData {
    userId: string;
    cityId: string;
    timestamp: number;
}

/**
 * Generate a signed token for unsubscribe links
 */
export function generateUnsubscribeToken(userId: string, cityId: string): string {
    const data: UnsubscribeTokenData = {
        userId,
        cityId,
        timestamp: Date.now()
    };

    const payload = Buffer.from(JSON.stringify(data)).toString('base64');
    const signature = createHmac('sha256', env.NEXTAUTH_SECRET)
        .update(payload)
        .digest('base64');

    return `${payload}.${signature}`;
}

/**
 * Verify and extract data from unsubscribe token
 */
export function verifyUnsubscribeToken(token: string): UnsubscribeTokenData | null {
    try {
        const [payload, signature] = token.split('.');

        if (!payload || !signature) {
            return null;
        }

        // Verify signature
        const expectedSignature = createHmac('sha256', env.NEXTAUTH_SECRET)
            .update(payload)
            .digest('base64');

        if (signature !== expectedSignature) {
            console.error('Invalid token signature');
            return null;
        }

        // Decode payload
        const data: UnsubscribeTokenData = JSON.parse(
            Buffer.from(payload, 'base64').toString('utf-8')
        );

        // Check if token is expired (30 days)
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
        if (Date.now() - data.timestamp > maxAge) {
            console.error('Token expired');
            return null;
        }

        return data;

    } catch (error) {
        console.error('Error verifying unsubscribe token:', error);
        return null;
    }
}

