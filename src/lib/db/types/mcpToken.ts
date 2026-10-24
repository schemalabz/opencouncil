import { Prisma } from '@prisma/client';

/** The columns a token list shows. The hash never leaves the data module. */
export const mcpTokenListSelect = {
    id: true,
    name: true,
    keyPrefix: true,
    createdAt: true,
    lastUsedAt: true,
    revokedAt: true,
} satisfies Prisma.UserMcpTokenSelect;

export type McpTokenListRow = Prisma.UserMcpTokenGetPayload<{ select: typeof mcpTokenListSelect }>;

/**
 * Newest first. The id breaks a tie on createdAt: the personal token manager
 * numbers the rows by position, so two tokens created in the same instant
 * would otherwise swap labels between page loads.
 */
export const mcpTokenListOrder = [{ createdAt: 'desc' }, { id: 'desc' }] satisfies Prisma.UserMcpTokenOrderByWithRelationInput[];
