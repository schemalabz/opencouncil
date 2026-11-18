/** @jest-environment node */
// The city surfaces widen to the secondary tier by themselves (tabTier) for an
// admin of a secondary body and for a city whose content is secondary alone.
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))
jest.mock('@/components/cities/CityMeetings', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/cities/CityPeople', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/meetings/MeetingCardV2', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/cities/overview/MeetingsTimeline', () => ({ MeetingsTimeline: () => null }))
jest.mock('@/components/cities/overview/HotTopicsCard', () => ({ HotTopicsCard: () => null }))
jest.mock('@/components/cities/overview/CouncilBand', () => ({ CouncilBand: () => null }))
jest.mock('@/i18n/routing', () => ({ Link: () => null }))

import prisma from '@/lib/db/prisma'
import MeetingsPage from '@/app/[locale]/(city)/[cityId]/(other)/(tabs)/meetings/page'
import PeoplePage from '@/app/[locale]/(city)/[cityId]/(other)/(tabs)/people/page'
import CityOverviewPage from '@/app/[locale]/(city)/[cityId]/(other)/(tabs)/page'
import LatestMeetingPage from '@/app/[locale]/(city)/[cityId]/latest/page'
import { __setSessionEmail } from '../mocks/auth'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createUser } from '../helpers/factories'

const MIXED = 'mixed_city'   // a council and a youth council
const YOUTH_ONLY = 'youth_city' // a youth council alone
const PAST = new Date(Date.now() - 86_400_000)

type MeetingsProps = { rows: { id: string }[]; total: number; secondaryTier: { available: boolean; shown: boolean } }
type PeopleProps = { people: { id: string }[]; secondaryTier: { available: boolean; shown: boolean } }

async function meetings(cityId: string, query: Record<string, string> = {}): Promise<MeetingsProps> {
    const element = await MeetingsPage({ params: Promise.resolve({ cityId, locale: 'el' }), searchParams: Promise.resolve(query) })
    return element.props as MeetingsProps
}

async function people(cityId: string, query: Record<string, string> = {}): Promise<PeopleProps> {
    const element = await PeoplePage({ params: Promise.resolve({ cityId }), searchParams: Promise.resolve(query) })
    return element.props as PeopleProps
}

async function hotScope(cityId: string): Promise<string> {
    const element = await CityOverviewPage({ params: Promise.resolve({ cityId, locale: 'el' }), searchParams: Promise.resolve({}) })
    const [hotTopics] = element.props.children
    return hotTopics.props.scope
}

/** Where `/latest` sends the reader: the page answers with a redirect, which throws. */
async function latest(cityId: string): Promise<string> {
    try {
        await LatestMeetingPage({ params: Promise.resolve({ cityId }) })
    } catch (error) {
        return String((error as { digest?: string }).digest).split(';')[2]
    }
    throw new Error('no redirect')
}

const ids = (rows: { id: string }[]) => rows.map(row => row.id).sort()

describe('the tabs widen to the secondary tier by themselves (#829)', () => {
    let youthId: string
    let councilId: string

    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)

        await createCity({ id: MIXED, status: 'supported' })
        councilId = (await createAdministrativeBody(MIXED, { type: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Council' })).id
        youthId = (await createAdministrativeBody(MIXED, { type: 'youthCouncil', name: 'Συμβούλιο Νέων', name_en: 'Youth Council' })).id
        await createMeeting(MIXED, { id: 'council_m', administrativeBodyId: councilId, released: true, dateTime: PAST })
        await createMeeting(MIXED, { id: 'youth_m', administrativeBodyId: youthId, released: true, dateTime: PAST })
        // A meeting with no body is primary.
        await createMeeting(MIXED, { id: 'nobody_m', released: true, dateTime: PAST })
        for (const [person, body] of [['council_p', councilId], ['youth_p', youthId]] as const) {
            await prisma.person.create({ data: { id: person, cityId: MIXED, name: person, name_en: person, name_short: person, name_short_en: person } })
            await prisma.role.create({ data: { personId: person, cityId: MIXED, administrativeBodyId: body } })
        }

        await createCity({ id: YOUTH_ONLY, status: 'pending' })
        const lone = await createAdministrativeBody(YOUTH_ONLY, { type: 'youthCouncil', name: 'Συμβούλιο Νέων', name_en: 'Youth Council' })
        await createMeeting(YOUTH_ONLY, { id: 'lone_m', administrativeBodyId: lone.id, released: true, dateTime: PAST })
        await prisma.person.create({ data: { id: 'lone_p', cityId: YOUTH_ONLY, name: 'lone', name_en: 'lone', name_short: 'lone', name_short_en: 'lone' } })
        await prisma.role.create({ data: { personId: 'lone_p', cityId: YOUTH_ONLY, administrativeBodyId: lone.id } })

        const bodyAdmin = await createUser('youth-admin@example.test')
        await prisma.administers.create({ data: { userId: bodyAdmin.id, administrativeBodyId: youthId } })
        const cityAdmin = await createUser('city-admin@example.test')
        await prisma.administers.create({ data: { userId: cityAdmin.id, cityId: MIXED } })
    })

    afterEach(() => __setSessionEmail(null))

    test('a reader of a mixed city gets the primary tier on both tabs, and the checkbox', async () => {
        // The council chip is the default; it shows a meeting with no body only under «all», as on main.
        const m = await meetings(MIXED)
        expect(ids(m.rows)).toEqual(['council_m'])
        expect(m.secondaryTier).toEqual({ available: true, shown: false })
        const p = await people(MIXED)
        expect(ids(p.people)).toEqual(['council_p'])
        expect(p.secondaryTier).toEqual({ available: true, shown: false })
    })

    test('the admin of a secondary body gets every tier on both tabs, unless the URL asks for primary', async () => {
        __setSessionEmail('youth-admin@example.test')
        expect(ids((await meetings(MIXED)).rows)).toEqual(['council_m', 'nobody_m', 'youth_m'])
        expect(ids((await people(MIXED)).people)).toEqual(['council_p', 'youth_p'])
        expect(ids((await meetings(MIXED, { tier: 'primary' })).rows)).toEqual(['council_m'])
        expect(ids((await people(MIXED, { tier: 'primary' })).people)).toEqual(['council_p'])
    })

    test('a city admin keeps the primary tier and the checkbox', async () => {
        __setSessionEmail('city-admin@example.test')
        expect((await meetings(MIXED)).secondaryTier).toEqual({ available: true, shown: false })
        expect(ids((await people(MIXED)).people)).toEqual(['council_p'])
    })

    test('a city whose content is secondary alone shows it at once on both tabs', async () => {
        const m = await meetings(YOUTH_ONLY)
        expect(ids(m.rows)).toEqual(['lone_m'])
        expect(m.secondaryTier.shown).toBe(true)
        expect(ids((await people(YOUTH_ONLY)).people)).toEqual(['lone_p'])
    })

    test('a city whose content is secondary alone opens its ranking and /latest on that tier', async () => {
        expect(await hotScope(YOUTH_ONLY)).toBe('secondary')
        expect(await latest(YOUTH_ONLY)).toBe(`/${YOUTH_ONLY}/lone_m`)
    })

    test('a mixed city keeps its ranking and /latest on the primary tier', async () => {
        expect(await hotScope(MIXED)).toBe('council')
        // Both primary meetings fall on the same day.
        expect([`/${MIXED}/council_m`, `/${MIXED}/nobody_m`]).toContain(await latest(MIXED))
    })

    test('an unknown tier in the URL falls back to the rule of the tab, it does not widen', async () => {
        expect(ids((await meetings(MIXED, { tier: 'youth' })).rows)).toEqual(['council_m'])
        expect(ids((await people(MIXED, { tier: 'youth' })).people)).toEqual(['council_p'])
    })
})
