import { ensureTestDb, teardownTestDb } from './helpers/test-db'

// Replace the Prisma singleton with a lazy version that defers PrismaClient
// creation until first use. This is necessary because Jest loads modules
// (and the PrismaClient constructor fires) BEFORE beforeAll/ensureTestDb()
// sets process.env.DATABASE_URL. The Proxy delays creation until a test
// actually calls prisma.something, by which time the URL is set.
jest.mock('@/lib/db/prisma', () => {
    const { PrismaClient } = jest.requireActual('@prisma/client')
    let client: InstanceType<typeof PrismaClient> | null = null

    const handler: ProxyHandler<object> = {
        get: (_, prop: string) => {
            if (!client) {
                client = new PrismaClient({
                    log: ['error', 'warn'],
                    datasourceUrl: process.env.DATABASE_URL,
                })
            }
            const val = (client as any)[prop]
            return typeof val === 'function' ? val.bind(client) : val
        },
    }

    const proxy = new Proxy({}, handler)
    return { __esModule: true, default: proxy, prisma: proxy }
})

jest.setTimeout(180000)

beforeAll(async () => {
    await ensureTestDb()
})

afterAll(async () => {
    await teardownTestDb()
})
