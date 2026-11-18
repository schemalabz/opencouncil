/** @jest-environment node */
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))
jest.mock('@/components/cities/CityMeetings', () => ({ __esModule: true, default: () => null }))

import prisma from '@/lib/db/prisma'
import MeetingsPage from '@/app/[locale]/(city)/[cityId]/(other)/(tabs)/meetings/page'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { buildMeetingArchive, MeetingArchive } from '../helpers/meetingArchive'

type PageProps = { rows: { id: string }[]; total: number }

async function load(query: Record<string, string>): Promise<PageProps> {
    const element = await MeetingsPage({ params: Promise.resolve({ cityId: 'archive-test', locale: 'el' }), searchParams: Promise.resolve(query) })
    return element.props as PageProps
}

// Acceptance case 5 of #829: a municipal company typed `council` and set secondary.
describe('the meetings tab and a secondary body of type council', () => {
    let archive: MeetingArchive

    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        archive = await buildMeetingArchive(prisma)
        const company = await prisma.administrativeBody.create({
            data: { cityId: archive.cityId, name: 'Ζήρεια Α.Ε.', name_en: 'Ziria SA', type: 'council', tier: 'secondary' },
        })
        await prisma.councilMeeting.createMany({
            data: [1, 2, 3].map(i => ({ id: `company-${i}`, cityId: archive.cityId, administrativeBodyId: company.id, name: `Γενική Συνέλευση ${i}`, name_en: `General meeting ${i}`, dateTime: new Date(Date.UTC(2025, 2, i)), released: true })),
        })
    })

    test('the default view of a reader leaves its meetings out', async () => {
        const { rows, total } = await load({})
        expect(total).toBe(33)
        expect(rows.some(row => row.id.startsWith('company-'))).toBe(false)
    })

    test('the chip of the council type does not reach it', async () => {
        expect((await load({ filters: 'adminBodyType_council' })).total).toBe(33)
    })

    test('a widened tab shows it under the chip of its type', async () => {
        expect((await load({ filters: 'adminBodyType_council', tier: 'all' })).total).toBe(36)
    })

    test('the secondary tier alone shows only its meetings', async () => {
        const { rows, total } = await load({ tier: 'secondary' })
        expect(total).toBe(3)
        expect(rows.every(row => row.id.startsWith('company-'))).toBe(true)
    })
})
