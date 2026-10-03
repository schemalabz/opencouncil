/** @jest-environment node */
// A pass-through cache that records its keys, so a test can tell two viewers' entries apart.
const mockCacheKeys: string[] = []
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown, keys: string[]) => {
        mockCacheKeys.push(keys.join(':'))
        return fn
    },
}))
// The client component is not under test: the page's job is the props it hands it.
jest.mock('@/components/cities/CityMeetings', () => ({ __esModule: true, default: () => null }))

let bodiesOverride: null | ((cityId: string) => Promise<unknown>) = null
jest.mock('@/lib/cache', () => {
    const actual = jest.requireActual('@/lib/cache')
    return {
        ...actual,
        getPublicAdministrativeBodiesForCityCached: (cityId: string) =>
            bodiesOverride ? bodiesOverride(cityId) : actual.getPublicAdministrativeBodiesForCityCached(cityId),
    }
})

import prisma from '@/lib/db/prisma'
import MeetingsPage from '@/app/[locale]/(city)/[cityId]/(other)/(tabs)/meetings/page'
import { __setSessionEmail } from '../mocks/auth'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createUser, signInAsSuperAdmin } from '../helpers/factories'
import { buildMeetingArchive, MeetingArchive } from '../helpers/meetingArchive'

type PageProps = { rows: { id: string; continuationOfId?: string | null }[]; total: number; page: number }

async function load(query: Record<string, string>): Promise<PageProps> {
    const element = await MeetingsPage({
        params: Promise.resolve({ cityId: 'archive-test', locale: 'el' }),
        searchParams: Promise.resolve(query),
    })
    return element.props as PageProps
}

async function signInAsAdminOf(email: string, grant: { administrativeBodyId: string } | { cityId: string }) {
    const admin = await createUser(email)
    await prisma.administers.create({ data: { userId: admin.id, ...grant } })
    __setSessionEmail(admin.email)
}

describe('meetings page - integration', () => {
    let archive: MeetingArchive

    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        archive = await buildMeetingArchive(prisma)
    })

    afterEach(async () => {
        __setSessionEmail(null)
        bodiesOverride = null
        await prisma.user.deleteMany({ where: { email: { endsWith: '@integration.test' } } })
    })

    test('a reader opens the council by default, page 1 of 33', async () => {
        const { rows, total, page } = await load({})
        expect(total).toBe(33)
        expect(page).toBe(1)
        expect(rows).toHaveLength(12)
        expect(rows.every(row => row.id.startsWith('council-'))).toBe(true)
    })

    test('"all" counts the meetings with no body', async () => {
        expect((await load({ filters: '*' })).total).toBe(136)
    })

    test('a page past the end shows the last page, with its rows', async () => {
        const { rows, total, page } = await load({ page: '999' })
        expect(total).toBe(33)
        expect(page).toBe(3)
        expect(rows).toHaveLength(9)
    })

    test('a search pages over the matches, and clamps too', async () => {
        const result = await load({ filters: '*', search: 'λογοδοσιας', page: '7' })
        expect(result.total).toBe(3)
        expect(result.page).toBe(1)
        expect(result.rows.map(row => row.id)).toEqual(['council-24', 'council-12', 'council-0'])
    })

    test('a search that finds nothing shows nothing, not the whole list', async () => {
        const result = await load({ filters: '*', search: 'ανυπαρκτολεξη' })
        expect(result.total).toBe(0)
        expect(result.rows).toEqual([])
    })

    test('a search of spaces only lists the meetings unfiltered', async () => {
        expect((await load({ search: '   ' })).total).toBe(33)
    })

    test('a type with no body in the full body list shows nothing, not every meeting', async () => {
        // Two body caches out of step: the picker knows the community type, the full list does not.
        bodiesOverride = async (cityId: string) =>
            prisma.administrativeBody.findMany({ where: { cityId, type: { not: 'community' } } })
        const result = await load({ filters: 'adminBodyType_community' })
        expect(result.total).toBe(0)
        expect(result.rows).toEqual([])
    })

    test('a body admin counts and finds the drafts of their own body only', async () => {
        await signInAsAdminOf('page-body-admin@integration.test', { administrativeBodyId: archive.bodies.committee })
        expect((await load({ filters: 'adminBodyType_committee' })).total).toBe(36)
        expect((await load({ filters: 'adminBodyType_council' })).total).toBe(33)
        expect((await load({ filters: '*' })).total).toBe(139)
        // A reader finds 33 committee meetings; this admin 36.
        expect((await load({ filters: '*', search: 'δημοτικη επιτροπη' })).total).toBe(36)
        expect((await load({ filters: '*', search: 'δημοτικο συμβουλιο' })).total).toBe(37)
    })

    test('a city admin counts every draft', async () => {
        await signInAsAdminOf('page-city-admin@integration.test', { cityId: archive.cityId })
        expect((await load({ filters: '*' })).total).toBe(148)
    })

    test('a reader and a body admin never share a count cache entry', async () => {
        mockCacheKeys.length = 0
        await load({})
        const readerKey = mockCacheKeys.find(key => key.includes(':meetingCount:'))

        await signInAsAdminOf('key-admin@integration.test', { administrativeBodyId: archive.bodies.council })
        mockCacheKeys.length = 0
        await load({})
        const adminKey = mockCacheKeys.find(key => key.includes(':meetingCount:'))

        expect(readerKey).toBeDefined()
        expect(adminKey).toBeDefined()
        expect(adminKey).not.toBe(readerKey)
    })

    test('a body admin reaches the drafts of a body with no released meeting through its chip', async () => {
        const draftsOnly = await prisma.administrativeBody.create({
            data: { cityId: archive.cityId, name: '3η Δημοτική Κοινότητα', name_en: '3rd Municipal Community', type: 'community' },
        })
        await prisma.councilMeeting.createMany({
            data: [1, 2].map(i => ({ id: `drafts-only-${i}`, cityId: archive.cityId, administrativeBodyId: draftsOnly.id, name: `Πρόχειρη ${i}`, name_en: `Draft ${i}`, dateTime: new Date(Date.UTC(2025, 0, i)), released: false })),
        })
        try {
            await signInAsAdminOf('drafts-admin@integration.test', { administrativeBodyId: draftsOnly.id })
            expect((await load({ filters: 'adminBodyType_community', body: '3η Δημοτική Κοινότητα' })).total).toBe(2)
        } finally {
            await prisma.councilMeeting.deleteMany({ where: { cityId: archive.cityId, administrativeBodyId: draftsOnly.id } })
            await prisma.administrativeBody.delete({ where: { id: draftsOnly.id } })
        }
    })

    describe('the link to another meeting', () => {
        beforeAll(async () => {
            await prisma.councilMeeting.create({
                data: { id: 'continuation-p', cityId: archive.cityId, name: 'Συνέχεια μοναδικη', name_en: 'Continuation', administrativeBodyId: archive.bodies.council, continuationOfId: 'council-1', dateTime: new Date('2030-05-02T15:00:00Z'), released: true },
            })
        })

        afterAll(async () => {
            await prisma.councilMeeting.delete({ where: { cityId_id: { cityId: archive.cityId, id: 'continuation-p' } } })
        })

        test('is hidden from a reader on the search path and the list path', async () => {
            expect((await load({ search: 'μοναδικη' })).rows.map(row => row.continuationOfId)).toEqual([null])
            const list = await load({})
            expect(list.rows[0].id).toBe('continuation-p')
            expect(list.rows[0].continuationOfId).toBeNull()
        })

        test('is hidden from a body admin, who may not see every meeting', async () => {
            await signInAsAdminOf('link-admin@integration.test', { administrativeBodyId: archive.bodies.council })
            expect((await load({ search: 'μοναδικη' })).rows.map(row => row.continuationOfId)).toEqual([null])
        })

        test('is shown to a superadmin on both paths', async () => {
            await signInAsSuperAdmin()
            expect((await load({ search: 'μοναδικη' })).rows[0].continuationOfId).toBe('council-1')
            expect((await load({})).rows[0].continuationOfId).toBe('council-1')
        })
    })
})
