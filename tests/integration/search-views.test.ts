/** @jest-environment node */
import fs from 'fs'
import path from 'path'
import prisma from '@/lib/db/prisma'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { splitSqlStatements } from '../helpers/sql'
import { createCity, createMeeting, createPerson, createSubject } from '../helpers/factories'

const VIEWS_PATH = path.join(__dirname, '../../elasticsearch/views.sql')

/** The DROP and CREATE statements of views.sql. The file also holds psql
 *  meta-commands (\echo) and validation queries, which only psql runs. */
function viewStatements(): string[] {
    const sql = fs.readFileSync(VIEWS_PATH, 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--') && !line.trimStart().startsWith('\\'))
        .join('\n')
    return splitSqlStatements(sql).filter((statement) => /^\s*(DROP|CREATE)\b/i.test(statement))
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

async function createParty(cityId: string, name: string) {
    return prisma.party.create({
        data: { name, name_en: name, name_short: name, name_short_en: name, colorHex: '#000000', cityId },
    })
}

async function createRole(personId: string, partyId: string, startDate: Date | null, endDate: Date | null, isHead = false) {
    return prisma.role.create({ data: { personId, partyId, startDate, endDate, isHead } })
}

/** A subject introduced by `personId` at a meeting on `date`, with one contribution by the same person. */
async function subjectAt(cityId: string, personId: string, date: Date) {
    const meeting = await createMeeting(cityId, { dateTime: date })
    const subject = await createSubject(meeting.id, cityId)
    await prisma.subject.update({ where: { id: subject.id }, data: { personId } })
    await prisma.speakerContribution.create({ data: { subjectId: subject.id, speakerId: personId, text: 'Τοποθέτηση' } })
    return subject.id
}

async function introducerParty(subjectId: string): Promise<string | null | undefined> {
    const rows = await prisma.$queryRaw<{ party_id: string }[]>`
        SELECT party_id FROM "IntroducedByPartyView" WHERE id = ${subjectId}`
    if (rows.length > 1) throw new Error(`IntroducedByPartyView has ${rows.length} rows for ${subjectId}`)
    return rows[0]?.party_id ?? null
}

async function speakerParty(subjectId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ speaker_party_id: string | null }[]>`
        SELECT speaker_party_id FROM "SpeakerContributionSearchView" WHERE "subjectId" = ${subjectId}`
    if (rows.length !== 1) throw new Error(`SpeakerContributionSearchView has ${rows.length} rows for ${subjectId}`)
    return rows[0].speaker_party_id
}

/** Both views must agree: the party of the introducer and of the speaker. */
async function partiesOf(subjectId: string) {
    return { introducer: await introducerParty(subjectId), speaker: await speakerParty(subjectId) }
}

describe('search views: party at the date of the meeting', () => {
    let cityId: string
    let first: string
    let second: string

    beforeAll(async () => {
        await ensureTestDb()
        for (const statement of viewStatements()) {
            await prisma.$executeRawUnsafe(statement)
        }
    })

    beforeEach(async () => {
        await resetDatabase(prisma)
        cityId = (await createCity()).id
        first = (await createParty(cityId, 'Πρώτη')).id
        second = (await createParty(cityId, 'Δεύτερη')).id
    })

    afterAll(async () => {
        await prisma.$disconnect()
    })

    it('gives a subject the party of its meeting date after a party switch', async () => {
        const person = await createPerson(cityId)
        await createRole(person.id, first, day('2024-01-01'), day('2025-06-01'))
        await createRole(person.id, second, day('2025-06-01'), null)

        const before = await subjectAt(cityId, person.id, day('2025-03-01'))
        const after = await subjectAt(cityId, person.id, day('2026-01-01'))

        expect(await partiesOf(before)).toEqual({ introducer: first, speaker: first })
        expect(await partiesOf(after)).toEqual({ introducer: second, speaker: second })
    })

    it('treats startDate as inclusive and endDate as exclusive, as isRoleActiveAt does', async () => {
        const person = await createPerson(cityId)
        await createRole(person.id, first, day('2024-01-01'), day('2025-06-01'))
        await createRole(person.id, second, day('2025-06-01'), null)

        const onSwitch = await subjectAt(cityId, person.id, day('2025-06-01'))
        const onStart = await subjectAt(cityId, person.id, day('2024-01-01'))

        expect(await partiesOf(onSwitch)).toEqual({ introducer: second, speaker: second })
        expect(await partiesOf(onStart)).toEqual({ introducer: first, speaker: first })
    })

    it('matches a role with no start or end date at any meeting date', async () => {
        const person = await createPerson(cityId)
        await createRole(person.id, first, null, null)

        const subject = await subjectAt(cityId, person.id, day('2019-05-05'))

        expect(await partiesOf(subject)).toEqual({ introducer: first, speaker: first })
    })

    it('gives no party when no role is active at the meeting date', async () => {
        const person = await createPerson(cityId)
        await createRole(person.id, first, day('2020-01-01'), day('2021-01-01'))

        const subject = await subjectAt(cityId, person.id, day('2025-01-01'))

        expect(await partiesOf(subject)).toEqual({ introducer: null, speaker: null })
    })

    it('keeps one row per subject when two roles overlap, preferring the head role', async () => {
        const person = await createPerson(cityId)
        await createRole(person.id, first, day('2020-01-01'), null, true)
        await createRole(person.id, second, day('2024-01-01'), null)

        const subject = await subjectAt(cityId, person.id, day('2025-01-01'))

        expect(await partiesOf(subject)).toEqual({ introducer: first, speaker: first })
    })

})
