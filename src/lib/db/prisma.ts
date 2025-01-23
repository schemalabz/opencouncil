import { PrismaClient } from '@prisma/client'
import { PrismaClient as EdgePrismaClient } from '@prisma/client/edge'
import { withAccelerate } from '@prisma/extension-accelerate'

const prismaClientSingleton = () => {
    if (process.env.WITH_PRISMA_ACCELERATE) {
        return new EdgePrismaClient().$extends(withAccelerate())
    }
    return new PrismaClient({
        // log: ['query']
    })
}

declare const globalThis: {
    prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
