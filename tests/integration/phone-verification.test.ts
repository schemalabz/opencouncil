/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { confirmPhoneCode, requestPhoneCode, setAccountPhone, stagePhone } from '@/lib/db/phoneVerification'
import { sendVerificationSms } from '@/lib/phone-verification/sms'
import { MAX_ATTEMPTS, SEND_WINDOW_MS } from '@/lib/phone-verification/constants'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createUser } from '../helpers/factories'

// The SMS hands its code to the test instead of to Bird.
const mockSent: Array<{ phone: string; code: string }> = []
jest.mock('@/lib/phone-verification/sms', () => ({
    isSmsConfigured: () => true,
    sendVerificationSms: jest.fn(async (phone: string, code: string) => {
        mockSent.push({ phone, code })
        return { ok: true }
    }),
}))

const mockReport = jest.fn(async (_input: { userId: string; phone: string; phoneSendCount: number }) => {})
jest.mock('@/lib/phone-verification/abuseAlerts', () => ({
    reportUnusualCodeRequest: (input: { userId: string; phone: string; phoneSendCount: number }) => mockReport(input),
}))

const mockSend = sendVerificationSms as jest.MockedFunction<typeof sendVerificationSms>
const lastCodeFor = (phone: string) => [...mockSent].reverse().find((s) => s.phone === phone)?.code
const T0 = Date.now()
const at = (ms: number) => () => new Date(T0 + ms)

/**
 * The optional phone verification (issue #813) under real concurrency: the
 * send log and its advisory locks, the attempt claim, and the confirmation
 * that moves a number onto an account.
 */
describe('phone verification', () => {
    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        mockSent.length = 0
        mockReport.mockClear()
    })

    test('ten parallel requests from one account send one code', async () => {
        const user = await createUser('burst@test.local')
        const results = await Promise.all(
            Array.from({ length: 10 }, () => requestPhoneCode(user.id, '+306900000101', { locale: 'el' })),
        )
        expect(results.filter((r) => r.ok && r.resendInMs === undefined)).toHaveLength(1)
        expect(mockSent).toHaveLength(1)
        expect(await prisma.phoneCodeSend.count({ where: { userId: user.id } })).toBe(1)
    })

    test('switching numbers does not reset the account cap', async () => {
        const user = await createUser('switch@test.local')
        const numbers = ['+306900000102', '+306900000103', '+306900000102', '+306900000103', '+306900000102']
        const outcomes: string[] = []
        for (const [i, phone] of numbers.entries()) {
            const r = await requestPhoneCode(user.id, phone, { now: at((i + 1) * 31_000) })
            outcomes.push(r.ok ? 'sent' : r.code)
        }
        expect(outcomes).toEqual(['sent', 'sent', 'sent', 'too_many', 'too_many'])
        expect(mockSent).toHaveLength(3)
    })

    test('parallel guesses spend at most five attempts, and the right code is refused after them', async () => {
        const user = await createUser('guess@test.local')
        await requestPhoneCode(user.id, '+306900000104')
        const guesses = await Promise.all(
            Array.from({ length: 20 }, (_, i) => confirmPhoneCode(user.id, String(100000 + i))),
        )
        expect(guesses.filter((g) => !g.ok && g.code === 'code_invalid').length).toBeLessThan(MAX_ATTEMPTS)
        expect((await prisma.phoneVerification.findUniqueOrThrow({ where: { userId: user.id } })).attempts).toBe(MAX_ATTEMPTS)
        const late = await confirmPhoneCode(user.id, lastCodeFor('+306900000104')!)
        expect(late).toEqual({ ok: false, code: 'too_many_attempts' })
    })

    test('a number gets at most five codes an hour across accounts, and the refusal names the exact wait', async () => {
        const phone = '+306900000105'
        for (let i = 0; i < 5; i++) {
            const u = await createUser(`cap${i}@test.local`)
            expect((await requestPhoneCode(u.id, phone, { now: at(i * 60_000) })).ok).toBe(true)
        }
        const sixth = await createUser('cap6@test.local')
        const refused = await requestPhoneCode(sixth.id, phone, { now: at(55 * 60_000) })
        expect(refused).toEqual({ ok: false, code: 'too_many', retryAfterMs: SEND_WINDOW_MS - 55 * 60_000 })
        // The operators hear of the third code to one number, and of the cap.
        expect(mockReport.mock.calls.map(([input]) => input.phoneSendCount)).toEqual([1, 2, 3, 4, 5])
    })

    test('an SMS that got no answer keeps its code and its send; a refused one releases both', async () => {
        const user = await createUser('unclear@test.local')
        const phone = '+306900000109'
        mockSend.mockResolvedValueOnce({ ok: false, reason: 'unreachable' })
        expect(await requestPhoneCode(user.id, phone, { now: at(0) })).toEqual({ ok: false, code: 'send_failed' })
        const kept = await prisma.phoneVerification.findUniqueOrThrow({ where: { userId: user.id } })
        expect(kept.codeHash).not.toBeNull()
        expect(await prisma.phoneCodeSend.count({ where: { userId: user.id } })).toBe(1)
        // The send counts, so the operators hear of it as of any other.
        expect(mockReport).toHaveBeenCalledTimes(1)

        mockSend.mockResolvedValueOnce({ ok: false, reason: 'rejected' })
        expect(await requestPhoneCode(user.id, phone, { now: at(31_000) })).toEqual({ ok: false, code: 'send_failed' })
        const restored = await prisma.phoneVerification.findUniqueOrThrow({ where: { userId: user.id } })
        expect(restored.codeHash).toBe(kept.codeHash)
        expect(await prisma.phoneCodeSend.count({ where: { userId: user.id } })).toBe(1)
        // A refused SMS went nowhere: no alert counts it.
        expect(mockReport).toHaveBeenCalledTimes(1)
    })

    test('a code is never written onto a number it was not sent to', async () => {
        // A request for A races a staging of B on the same account. Whatever
        // the order, the code that went to A must never prove B.
        for (let i = 0; i < 15; i++) {
            const user = await createUser(`race${i}@test.local`)
            const a = `+3069000002${String(i).padStart(2, '0')}`
            const b = `+3069000003${String(i).padStart(2, '0')}`
            await stagePhone(user.id, a)
            await Promise.all([requestPhoneCode(user.id, a), stagePhone(user.id, b)])
            const code = lastCodeFor(a)
            if (!code) continue
            const result = await confirmPhoneCode(user.id, code)
            if (result.ok) expect(result.phone).toBe(a)
            expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).phone).not.toBe(b)
        }
    })

    test('two accounts confirming one number at once: one gets it, the other hears phone_in_use', async () => {
        const phone = '+306900000106'
        const x = await createUser('x@test.local')
        const y = await createUser('y@test.local')
        await requestPhoneCode(x.id, phone)
        const codeX = lastCodeFor(phone)!
        await requestPhoneCode(y.id, phone)
        const codeY = lastCodeFor(phone)!

        const [rx, ry] = await Promise.all([confirmPhoneCode(x.id, codeX), confirmPhoneCode(y.id, codeY)])

        const winners = [rx, ry].filter((r) => r.ok)
        expect(winners).toHaveLength(1)
        expect([rx, ry].filter((r) => !r.ok && r.code === 'phone_in_use')).toHaveLength(1)
        const holders = await prisma.user.findMany({ where: { phone }, select: { id: true, phoneVerifiedAt: true } })
        expect(holders).toHaveLength(1)
        expect(holders[0].phoneVerifiedAt).not.toBeNull()
    })

    test('parallel right codes all succeed and move the number once', async () => {
        const user = await createUser('twice@test.local')
        await requestPhoneCode(user.id, '+306900000107')
        const code = lastCodeFor('+306900000107')!
        const results = await Promise.all(Array.from({ length: 5 }, () => confirmPhoneCode(user.id, code)))
        expect(results.every((r) => r.ok)).toBe(true)
        expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ phone: '+306900000107' })
    })

    test('an unverified claim gives way to the reader who proves the number', async () => {
        const phone = '+306900000108'
        const legacy = await createUser('legacy@test.local', { phone })
        const owner = await createUser('owner@test.local')
        await requestPhoneCode(owner.id, phone)
        expect(await confirmPhoneCode(owner.id, lastCodeFor(phone)!)).toMatchObject({ ok: true, phone })
        expect((await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).phone).toBeNull()
    })

    test('a number is saved unproved at once; a proved one is refused, a typed one needs the code', async () => {
        const reader = await createUser('reader@test.local')
        expect(await setAccountPhone(reader.id, '+306900000120')).toMatchObject({ ok: true })
        expect(await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).toMatchObject({
            phone: '+306900000120',
            phoneVerifiedAt: null,
        })

        // Proving it, then changing it: the new number is unproved again.
        await requestPhoneCode(reader.id, '+306900000120')
        await confirmPhoneCode(reader.id, lastCodeFor('+306900000120')!)
        expect((await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).phoneVerifiedAt).not.toBeNull()

        const other = await createUser('other@test.local')
        expect(await setAccountPhone(other.id, '+306900000120')).toEqual({ ok: false, code: 'phone_in_use' })

        await createUser('typed@test.local', { phone: '+306900000121' })
        expect(await setAccountPhone(other.id, '+306900000121')).toEqual({ ok: false, code: 'needs_code' })
        expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).phone).toBeNull()

        expect(await setAccountPhone(reader.id, '+306900000122')).toMatchObject({ ok: true })
        expect(await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).toMatchObject({
            phone: '+306900000122',
            phoneVerifiedAt: null,
        })
    })

    test('saving another number drops the code that waited for the old one', async () => {
        const reader = await createUser('stale@test.local')
        await requestPhoneCode(reader.id, '+306900000130')
        const oldCode = lastCodeFor('+306900000130')!

        expect(await setAccountPhone(reader.id, '+306900000131')).toMatchObject({ ok: true })

        expect(await confirmPhoneCode(reader.id, oldCode)).toEqual({ ok: false, code: 'no_pending' })
        expect((await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).phone).toBe('+306900000131')
    })

    test('a consent saved with the number rides the same write, for a new number and for the same one', async () => {
        const reader = await createUser('consent@test.local', { allowPetitionUpdates: false })
        expect(await setAccountPhone(reader.id, '+306900000140', { allowPetitionUpdates: true })).toMatchObject({ ok: true })
        expect(await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).toMatchObject({
            phone: '+306900000140',
            allowPetitionUpdates: true,
        })

        await prisma.user.update({ where: { id: reader.id }, data: { allowPetitionUpdates: false } })
        expect(await setAccountPhone(reader.id, '+306900000140', { allowPetitionUpdates: true })).toMatchObject({ ok: true })
        expect((await prisma.user.findUniqueOrThrow({ where: { id: reader.id } })).allowPetitionUpdates).toBe(true)

        // Refused: neither the number nor the consent is written.
        const other = await createUser('consent2@test.local', { allowPetitionUpdates: false })
        await requestPhoneCode(reader.id, '+306900000140')
        await confirmPhoneCode(reader.id, lastCodeFor('+306900000140')!)
        expect(await setAccountPhone(other.id, '+306900000140', { allowPetitionUpdates: true })).toEqual({ ok: false, code: 'phone_in_use' })
        expect(await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({
            phone: null,
            allowPetitionUpdates: false,
        })
    })

    test('two accounts saving one free number at once: one saves it, the other is told, and nothing throws', async () => {
        for (let i = 0; i < 10; i++) {
            const phone = `+3069000005${String(i).padStart(2, '0')}`
            const a = await createUser(`sa${i}@test.local`)
            const b = await createUser(`sb${i}@test.local`)
            const outcomes = await Promise.all([setAccountPhone(a.id, phone), setAccountPhone(b.id, phone)])
            expect(outcomes.filter((o) => o.ok)).toHaveLength(1)
            expect(outcomes.filter((o) => !o.ok && o.code === 'needs_code')).toHaveLength(1)
            expect(await prisma.user.count({ where: { phone } })).toBe(1)
        }
    })
})
