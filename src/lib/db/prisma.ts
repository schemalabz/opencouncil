import { env } from '@/env.mjs'
import { createPrismaClient } from './createPrismaClient'

const globalForPrisma = globalThis as unknown as {
    prisma: ReturnType<typeof createPrismaClient> | undefined;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient(env.DATABASE_URL)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma;