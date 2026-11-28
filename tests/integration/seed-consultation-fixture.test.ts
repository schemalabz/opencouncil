/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { CONSULTATION_FIXTURE_JSON, ensureConsultationFixture } from '@/lib/db/consultationFixture'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createCity } from '../helpers/factories'

const fixture = () => prisma.consultation.findUnique({ where: { id: 'music-hours' } })

describe('ensureConsultationFixture', () => {
    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
    })

    test('does nothing in a database without Athens', async () => {
        await ensureConsultationFixture(prisma)
        expect(await prisma.consultation.count()).toBe(0)
    })

    test('adds an open consultation to Athens, and a second run keeps its end date', async () => {
        await createCity({ id: 'athens', consultationsEnabled: false })
        await ensureConsultationFixture(prisma)

        const first = await fixture()
        expect(first).toMatchObject({ cityId: 'athens', isActive: true, jsonUrl: CONSULTATION_FIXTURE_JSON })
        expect(first!.endDate.getTime()).toBeGreaterThan(Date.now())
        expect((await prisma.city.findUniqueOrThrow({ where: { id: 'athens' } })).consultationsEnabled).toBe(true)

        await ensureConsultationFixture(prisma)
        expect(await prisma.consultation.count()).toBe(1)
        expect((await fixture())!.endDate).toEqual(first!.endDate)
    })

    test('opens the consultation again after it has closed', async () => {
        await prisma.consultation.update({ where: { id: 'music-hours' }, data: { endDate: new Date('2020-01-01T23:59:00Z') } })
        await ensureConsultationFixture(prisma)
        expect((await fixture())!.endDate.getTime()).toBeGreaterThan(Date.now())
    })
})
