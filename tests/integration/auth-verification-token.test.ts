/** @jest-environment node */

import prisma from '@/lib/db/prisma'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { resetDatabase } from '../helpers/test-db'

/**
 * Integration coverage for patches/@auth+prisma-adapter+*.patch.
 *
 * Upstream's `useVerificationToken` calls `verificationToken.delete(...)`, which
 * consumes a magic-link token on the first read. Email security scanners pre-fetch
 * links, so the scanner burns the token and the human who clicks it gets a dead
 * link. The patch swaps that for `findUnique` so the token survives the read.
 *
 * The patch is pinned to an exact version by patch-package, so it stops applying
 * on every `@auth/prisma-adapter` bump — and when it does, `postinstall` fails
 * loudly but the *behaviour* regression is silent. Nothing tested it before this.
 *
 * These tests assert the property the patch exists for, against a real database.
 */

const adapter = PrismaAdapter(prisma)

const identifier = 'scanner-and-human@example.com'
const token = 'verification-token-under-test'

beforeEach(async () => {
    await resetDatabase(prisma)
    await prisma.verificationToken.create({
        data: {
            identifier,
            token,
            expires: new Date(Date.now() + 60 * 60 * 1000),
        },
    })
})

describe('useVerificationToken (patched adapter)', () => {
    it('returns the token without consuming it, so a second read still succeeds', async () => {
        const first = await adapter.useVerificationToken!({ identifier, token })
        expect(first).toMatchObject({ identifier, token })

        // The scanner has now read it. The human clicking the link must still work.
        const second = await adapter.useVerificationToken!({ identifier, token })
        expect(second).toMatchObject({ identifier, token })
    })

    it('leaves the row in place rather than deleting it', async () => {
        await adapter.useVerificationToken!({ identifier, token })

        const row = await prisma.verificationToken.findUnique({
            where: { identifier_token: { identifier, token } },
        })
        expect(row).not.toBeNull()
    })

    it('returns null for a token that does not exist', async () => {
        const missing = await adapter.useVerificationToken!({
            identifier,
            token: 'no-such-token',
        })
        expect(missing).toBeNull()
    })
})
