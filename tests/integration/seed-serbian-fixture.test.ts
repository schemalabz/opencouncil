/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { ensureSerbianFixture } from '@/lib/db/serbianFixture'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'

async function counts() {
    return {
        cities: await prisma.city.count({ where: { id: 'beograd' } }),
        meetings: await prisma.councilMeeting.count({ where: { cityId: 'beograd' } }),
        subjects: await prisma.subject.count({ where: { cityId: 'beograd' } }),
        utterances: await prisma.utterance.count({ where: { speakerSegment: { cityId: 'beograd' } } }),
    }
}

describe('ensureSerbianFixture', () => {
    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
    })

    test('adds the Belgrade review city with a transcribed meeting, and a second run changes nothing', async () => {
        await ensureSerbianFixture(prisma)
        const first = await counts()
        expect(first.cities).toBe(1)
        expect(first.meetings).toBeGreaterThan(0)
        expect(first.subjects).toBeGreaterThan(0)
        expect(first.utterances).toBeGreaterThan(0)
        await ensureSerbianFixture(prisma)
        expect(await counts()).toEqual(first)
    })
})
