import { PrismaClient } from '@prisma/client'

import { env } from '@/env.mjs'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
}

/**
 * Prisma Client instance for database operations.
 * 
 * Uses a global instance in development to prevent multiple client instantiations,
 * and creates a new PrismaClient in production.
 * 
 * @remarks
 * Configured to log errors and warnings only.
 * 
 * @example
 * ```typescript
 * const user = await prisma.user.findUnique({ where: { id: 1 } });
 * ```
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: ['error', 'warn'],
    datasourceUrl: env.DATABASE_URL,
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma;