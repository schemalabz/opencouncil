// Server-only: mints/validates personal MCP tokens. The mcp actions module
// derives the userId from the session before calling these; keep them off the
// client bundle and the Server Action surface.
import "server-only";
import { createHash, randomBytes } from 'crypto';
import prisma from '@/lib/db/prisma';
import { GENERATED_MCP_TOKEN_NAME } from '@/lib/mcp/tokenNames';

const MCP_TOKEN_PREFIX = 'mcp_';
const KEY_BYTE_LENGTH = 32; // 256-bit token

function hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken(): string {
    const randomPart = randomBytes(KEY_BYTE_LENGTH).toString('base64url');
    return `${MCP_TOKEN_PREFIX}${randomPart}`;
}

/**
 * Create a new personal MCP token for a user. Returns the raw token exactly
 * once — only the hash is stored in the database.
 *
 * The name is generated rather than asked for: a personal address is
 * identified by its key prefix and its dates, and a label a person has to
 * invent adds nothing. Deliberately no ordinal here — deriving one would mean
 * counting first, and two concurrent creates would read the same count and
 * store the same number. The UI numbers the rows instead, where position is
 * exact and the label can follow the reader's language.
 */
export async function createUserMcpToken(userId: string) {
    const rawToken = generateRawToken();
    const hashedKey = hashToken(rawToken);
    const keyPrefix = rawToken.substring(0, 10); // "mcp_" + first 6 chars

    const token = await prisma.userMcpToken.create({
        data: {
            name: GENERATED_MCP_TOKEN_NAME,
            hashedKey,
            keyPrefix,
            userId,
        },
    });

    return { ...token, rawToken };
}

/**
 * List a user's MCP tokens (without revealing the actual token).
 */
export async function listUserMcpTokens(userId: string) {
    return prisma.userMcpToken.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            name: true,
            keyPrefix: true,
            createdAt: true,
            lastUsedAt: true,
            revokedAt: true,
        },
    });
}

/**
 * Revoke (soft-delete) an MCP token. Scoped by userId so users can only
 * revoke their own tokens.
 */
export async function revokeUserMcpToken(userId: string, tokenId: string) {
    return prisma.userMcpToken.update({
        where: { id: tokenId, userId },
        data: { revokedAt: new Date() },
    });
}

/**
 * Validate a raw MCP token. Returns the owning user's id if valid, null
 * otherwise. Updates lastUsedAt on successful validation.
 */
export async function validateUserMcpToken(rawToken: string): Promise<{ userId: string; tokenId: string } | null> {
    const hashedKey = hashToken(rawToken);

    const token = await prisma.userMcpToken.findUnique({
        where: { hashedKey },
    });

    if (!token || token.revokedAt) {
        return null;
    }

    // Update lastUsedAt without awaiting — fire and forget
    prisma.userMcpToken.update({
        where: { id: token.id },
        data: { lastUsedAt: new Date() },
    }).catch((err) => {
        console.error('Failed to update lastUsedAt for MCP token:', err);
    });

    return { userId: token.userId, tokenId: token.id };
}
