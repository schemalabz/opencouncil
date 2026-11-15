/** @jest-environment node */
// The rows that body-scope-contract.test.ts does not hold. A meeting with no
// body is primary, `ids` names bodies in any tier, a type never widens past the
// tier, and a person with no role is on the primary roster.
jest.mock('next/cache', () => ({
    revalidateTag: jest.fn(),
    revalidatePath: jest.fn(),
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

import { Realm } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { countCouncilMeetings, getCouncilMeetingsForCity } from '@/lib/db/meetingsList'
import { buildMapSubjectWhere, getSubjectCountForCity } from '@/lib/db/subject'
import { computeRecentHotSubjects } from '@/lib/hotSubjects'
import { publicMeetingWhere } from '@/lib/cityStatus'
import { countPeopleOfCity, listPeopleOfCity } from '@/lib/db/people'
import { CITY_COUNT_SELECT } from '@/lib/db/cityListing'
import { getSecondaryBodyIdsCached } from '@/lib/db/administrativeBodies'
import type { BodyScope } from '@/lib/utils/bodyTier'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSubject, signInAsSuperAdmin } from '../helpers/factories'

const CITY = 'gaps_city'
const SQUARE = 'POLYGON((23 38, 23.1 38, 23.1 38.1, 23 38.1, 23 38))'
const PAST = new Date(Date.now() - 86_400_000)

const COUNCIL = 'council'
const YOUTH = 'youth'
const PROMOTED = 'promoted'
const NOBODY = 'nobody' // a meeting with no body: primary, and the council's for a type filter

const meetingOf = (row: string) => `${row}_meeting`
const subjectOf = (row: string) => `${row}_subject`
const sorted = (rows: string[]) => [...rows].sort()

describe('the body scope: the rows the contract test leaves out (#829)', () => {
    const bodyIds: Record<string, string> = {}

    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        await signInAsSuperAdmin()
        await createCity({ id: CITY, status: 'supported', realm: Realm.greece })
        await prisma.$executeRaw`UPDATE "City" SET geometry = ST_GeomFromText(${SQUARE}, 4326) WHERE id = ${CITY}`
        bodyIds[COUNCIL] = (await createAdministrativeBody(CITY, { type: 'council' })).id
        bodyIds[YOUTH] = (await createAdministrativeBody(CITY, { type: 'youthCouncil', name: 'Νέοι', name_en: 'Youth' })).id
        bodyIds[PROMOTED] = (await createAdministrativeBody(CITY, { type: 'youthCouncil', tier: 'primary', name: 'Νέοι Β', name_en: 'Youth B' })).id
        for (const row of [COUNCIL, YOUTH, PROMOTED, NOBODY]) {
            await createMeeting(CITY, { id: meetingOf(row), administrativeBodyId: bodyIds[row] ?? null, released: true, dateTime: PAST })
            await createSubject(meetingOf(row), CITY, { id: subjectOf(row), name: `Θέμα ${row}` })
            await prisma.speakerContribution.create({ data: { subjectId: subjectOf(row), text: 'Τοποθέτηση', speakerName: 'Ομιλητής' } })
        }
        // A person with no role, and a member of the youth council alone.
        for (const id of ['no_role', 'youth_member']) {
            await prisma.person.create({ data: { id, cityId: CITY, name: id, name_en: id, name_short: id, name_short_en: id } })
        }
        await prisma.role.create({ data: { personId: 'youth_member', cityId: CITY, administrativeBodyId: bodyIds[YOUTH] } })
    })

    const SCOPES: { name: string; scope?: BodyScope; rows: string[] }[] = [
        { name: 'no scope keeps a meeting with no body', scope: undefined, rows: [COUNCIL, PROMOTED, NOBODY] },
        { name: 'the secondary tier leaves it out', scope: { tier: 'secondary' }, rows: [YOUTH] },
        { name: 'every tier keeps it', scope: { tier: 'all' }, rows: [COUNCIL, PROMOTED, YOUTH, NOBODY] },
        { name: 'the council type reads it as the council', scope: { types: ['council'] }, rows: [COUNCIL, NOBODY] },
        { name: 'the council type stays inside the secondary tier', scope: { tier: 'secondary', types: ['council'] }, rows: [] },
        { name: 'ids name a secondary body with no tier', scope: { ids: ['@youth'] }, rows: [YOUTH] },
        { name: 'ids win over the tier and the types', scope: { tier: 'primary', types: ['council'], ids: ['@youth'] }, rows: [YOUTH] },
    ]
    // The body ids exist only after beforeAll.
    const resolve = (scope?: BodyScope): BodyScope | undefined => scope?.ids ? { ...scope, ids: scope.ids.map(id => bodyIds[id.slice(1)]) } : scope

    describe.each(SCOPES)('$name', ({ scope, rows }) => {
        test('the meeting list, its count and the public meeting gate', async () => {
            const s = resolve(scope)
            expect(sorted((await getCouncilMeetingsForCity(CITY, { scope: s })).map(m => m.id))).toEqual(sorted(rows.map(meetingOf)))
            expect(await countCouncilMeetings(CITY, { scope: s })).toBe(rows.length)
            const gate = await prisma.councilMeeting.findMany({ where: { cityId: CITY, ...publicMeetingWhere('greece', s) }, select: { id: true } })
            expect(sorted(gate.map(m => m.id))).toEqual(sorted(rows.map(meetingOf)))
        })

        test('the hot subjects of the city', async () => {
            const hot = await computeRecentHotSubjects(CITY, { limit: 10, scope: resolve(scope) })
            expect(sorted(hot.map(item => item.subject.id))).toEqual(sorted(rows.map(subjectOf)))
        })
    })

    test('the map where keeps a meeting with no body in the primary tier and the council type', async () => {
        const read = async (tier?: BodyScope['tier'], bodyTypes?: BodyScope['types']) =>
            sorted((await prisma.subject.findMany({ where: buildMapSubjectWhere('greece', { allTime: true, tier, bodyTypes }), select: { id: true } })).map(s => s.id))
        expect(await read()).toEqual(sorted([COUNCIL, PROMOTED, NOBODY].map(subjectOf)))
        expect(await read(undefined, ['council'])).toEqual(sorted([COUNCIL, NOBODY].map(subjectOf)))
        expect(await read('secondary', ['council'])).toEqual([])
    })

    test('the city counts and the subject count of the city keep a meeting with no body', async () => {
        const city = await prisma.city.findUniqueOrThrow({ where: { id: CITY }, include: { _count: CITY_COUNT_SELECT } })
        expect(city._count.councilMeetings).toBe(3)
        expect(await getSubjectCountForCity(CITY)).toBe(3)
    })

    test('a person with no role is on the primary roster, and not in the secondary tier', async () => {
        const ids = async (tier?: BodyScope['tier']) => sorted((await listPeopleOfCity(CITY, { scope: { tier } })).map(p => p.id))
        expect(await ids()).toEqual(['no_role'])
        expect(await ids('secondary')).toEqual(['youth_member'])
        expect(await ids('all')).toEqual(['no_role', 'youth_member'])
        expect(await countPeopleOfCity(CITY, { tier: 'secondary' })).toBe(1)
        const city = await prisma.city.findUniqueOrThrow({ where: { id: CITY }, include: { _count: CITY_COUNT_SELECT } })
        expect(city._count.persons).toBe(1)
    })

    test('search reads the secondary bodies by their stored tier', async () => {
        expect(await getSecondaryBodyIdsCached('greece')).toEqual([bodyIds[YOUTH]])
    })
})
