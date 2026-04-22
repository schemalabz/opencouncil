import { createHash, randomBytes } from 'crypto';
import prisma from '@/lib/db/prisma';

const API_KEY_PREFIX = 'sk_';
const KEY_BYTE_LENGTH = 32; // 256-bit key

function hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
}

function generateRawKey(): string {
    const randomPart = randomBytes(KEY_BYTE_LENGTH).toString('base64url');
    return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Create a new service API key. Returns the raw key exactly once —
 * only the hash is stored in the database.
 */
export async function createServiceApiKey(name: string, createdById: string) {
    const rawKey = generateRawKey();
    const hashedKey = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 10); // "sk_" + first 7 chars

    const apiKey = await prisma.serviceApiKey.create({
        data: {
            name,
            hashedKey,
            keyPrefix,
            createdById,
        },
        include: {
            createdBy: {
                select: { name: true, email: true },
            },
        },
    });

    return { ...apiKey, rawKey };
}

/**
 * List all service API keys (without revealing the actual key).
 */
export async function getServiceApiKeys() {
    return prisma.serviceApiKey.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            name: true,
            keyPrefix: true,
            createdAt: true,
            lastUsedAt: true,
            revokedAt: true,
            createdBy: {
                select: { name: true, email: true },
            },
        },
    });
}

/**
 * Revoke (soft-delete) a service API key.
 */
export async function revokeServiceApiKey(id: string) {
    return prisma.serviceApiKey.update({
        where: { id },
        data: { revokedAt: new Date() },
    });
}

/**
 * Validate a bearer token against stored API keys.
 * Returns the key record if valid, null otherwise.
 * Updates lastUsedAt on successful validation.
 */
export async function validateServiceApiKey(rawKey: string) {
    const hashedKey = hashKey(rawKey);

    const apiKey = await prisma.serviceApiKey.findUnique({
        where: { hashedKey },
    });

    if (!apiKey || apiKey.revokedAt) {
        return null;
    }

    // Update lastUsedAt without awaiting — fire and forget
    prisma.serviceApiKey.update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
    }).catch((err) => {
        console.error('Failed to update lastUsedAt for API key:', err);
    });

    return apiKey;
}
