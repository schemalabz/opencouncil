import { PrismaClient } from '@prisma/client'
import { env } from '@/env.mjs'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: ['error', 'warn'],
    datasourceUrl: env.DATABASE_URL,
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma;