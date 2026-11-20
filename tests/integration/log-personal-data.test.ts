/** @jest-environment node */
import { format } from 'node:util'
import { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { saveNotificationPreferences } from '@/lib/db/notifications'
import { sendMagicLink } from '@/lib/auth/magicLink'
import { handleApiError } from '@/lib/api/errors'
import { __setSignInUrl } from '../mocks/auth'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity, createTopic } from '../helpers/factories'

/**
 * The server's console output goes to the log stores (Better Stack, PostHog
 * Logs), and they must not hold a reader's data. Each flow below runs with
 * canary values and fails if any of them reaches the console, the way a
 * console call or a printed error would put it there.
 */
const CANARY = {
    email: 'canary-logs@example.test',
    name: 'Κανάριος Καναριόπουλος',
    phone: '+306912345678',
    address: 'Οδός Καναρινιού 77',
    longitude: 23.7123456,
}

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'] as const

function captureConsole(): { output: () => string; restore: () => void } {
    const lines: string[] = []
    const spies = CONSOLE_METHODS.map((method) =>
        jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
            lines.push(format(...args))
        }),
    )
    return { output: () => lines.join('\n'), restore: () => spies.forEach((spy) => spy.mockRestore()) }
}

function expectNoCanary(text: string) {
    for (const [field, value] of Object.entries(CANARY)) {
        expect({ field, found: text.includes(String(value)) }).toEqual({ field, found: false })
    }
}

describe('the console holds no personal data of a reader', () => {
    let console_: ReturnType<typeof captureConsole>

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        console_ = captureConsole()
    })

    afterEach(() => {
        console_.restore()
        __setSignInUrl(null)
    })

    test('a signed-out sign-up with a name, an email, a phone and an address', async () => {
        const city = await createCity({ id: 'logs_city', supportsNotifications: true })
        const topic = await createTopic('logs_topic')

        await saveNotificationPreferences({
            cityId: city.id,
            email: CANARY.email,
            name: CANARY.name,
            phone: CANARY.phone,
            locations: [{ text: CANARY.address, coordinates: [CANARY.longitude, 37.98] }],
            topicIds: [topic.id],
            notifyByPhone: true,
            notifyByEmail: true,
        })

        // The flow ran: the reader exists. Then the console holds none of it.
        expect(await prisma.user.findUnique({ where: { email: CANARY.email } })).not.toBeNull()
        expectNoCanary(console_.output())
    })

    test('a magic link that goes out, and one that does not', async () => {
        expect(await sendMagicLink(CANARY.email)).toBe(true)
        __setSignInUrl('http://localhost:3000/sign-in?error=Configuration')
        expect(await sendMagicLink(CANARY.email)).toBe(false)

        // The capture is live: the failure line is there, without the address.
        expect(console_.output()).toContain('Magic link not sent')
        expectNoCanary(console_.output())
    })

    test('a failed write, in Prisma\'s own error log and in the log of a route', async () => {
        // A wrong type makes Prisma reject the call before it reaches the
        // database, as a validation error that carries the call with its
        // arguments, in every error format of Prisma 5.
        const failedCreate = (client: PrismaClient) => client.user
            .create({ data: { email: CANARY.email, name: 42 as unknown as string } })
            .then(() => null, (caught: unknown) => caught)

        // The control: a plain client's error carries the address. Without this,
        // a Prisma that stopped printing arguments would make the case pass empty.
        const plain = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
        try {
            expect(format(await failedCreate(plain))).toContain(CANARY.email)
        } finally {
            await plain.$disconnect()
        }

        // The app's client throws the same class without the arguments (see
        // createPrismaClient), so a route logs it as it is.
        const error = await failedCreate(prisma)
        expect(error).toBeInstanceOf(Prisma.PrismaClientValidationError)
        handleApiError(error)

        const output = console_.output()
        expect(output).toMatch(/prisma:error Invalid `[^`]*create\(\)` invocation/)
        expect(output).toContain('API Error: PrismaClientValidationError')
        expect(output).toContain('Argument `name`: Invalid value provided')
        expectNoCanary(output)
    })
})
