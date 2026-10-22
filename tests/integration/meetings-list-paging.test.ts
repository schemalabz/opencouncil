/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { countCouncilMeetings, findMeetingIdsMatching, getCouncilMeetingsWithSubjectPreview, type MeetingListOptions } from '@/lib/db/meetingsList'
import { getCouncilMeetingPreviewsByIds } from '@/lib/cache/queries'
import { __setSessionEmail } from '../mocks/auth'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createUser, signInAsSuperAdmin } from '../helpers/factories'
import { buildMeetingArchive, MeetingArchive } from '../helpers/meetingArchive'

const PAGE_SIZE = 12
const TZ = 'Europe/Athens'

/** Every row the options select, read page by page as the tab reads them. */
async function readAllPages(cityId: string, options: MeetingListOptions) {
    const ids: string[] = []
    for (let page = 1; ; page++) {
        const rows = await getCouncilMeetingsWithSubjectPreview(cityId, { ...options, page, pageSize: PAGE_SIZE })
        ids.push(...rows.map(row => row.id))
        if (rows.length < PAGE_SIZE) return ids
    }
}

describe('meetings list paging - integration', () => {
    let archive: MeetingArchive

    beforeAll(async () => {
        await ensureTestDb()
        await resetDatabase(prisma)
        archive = await buildMeetingArchive(prisma)
    })

    test('the count equals the rows that the pages return, for a reader', async () => {
        const options = { includeUnreleased: false }
        const total = await countCouncilMeetings(archive.cityId, options)
        expect(total).toBe(136)
        expect(await readAllPages(archive.cityId, options)).toHaveLength(total)
    })

    test('an editor counts and reads the unreleased meetings too', async () => {
        const options = { includeUnreleased: true }
        expect(await countCouncilMeetings(archive.cityId, options)).toBe(148)
        expect(await readAllPages(archive.cityId, options)).toEqual(expect.arrayContaining(archive.unreleasedIds))
    })

    test('the pages are newest first, with no row twice', async () => {
        const ids = await readAllPages(archive.cityId, { includeUnreleased: false })
        expect(new Set(ids).size).toBe(ids.length)
        const rows = await prisma.councilMeeting.findMany({ where: { cityId: archive.cityId, id: { in: ids } }, select: { id: true, dateTime: true } })
        const time = new Map(rows.map(row => [row.id, row.dateTime.getTime()]))
        const times = ids.map(id => time.get(id) ?? 0)
        expect(times).toEqual([...times].sort((a, b) => b - a))
    })

    test('a body-id filter leaves out the meetings with no body', async () => {
        const options = { includeUnreleased: false, administrativeBodyIds: [archive.bodies.council] }
        expect(await countCouncilMeetings(archive.cityId, options)).toBe(33)
        const ids = await readAllPages(archive.cityId, options)
        expect(ids).toHaveLength(33)
        expect(ids).not.toEqual(expect.arrayContaining([archive.unassignedIds[0]]))
    })

    test('no body filter includes the meetings with no body', async () => {
        const ids = await readAllPages(archive.cityId, { includeUnreleased: false })
        expect(ids).toEqual(expect.arrayContaining(archive.unassignedIds))
    })

    test('meetingIds selects exactly those meetings, newest first', async () => {
        const rows = await getCouncilMeetingsWithSubjectPreview(archive.cityId, {
            includeUnreleased: false,
            meetingIds: ['council-0', 'committee-35', 'unassigned-1'],
        })
        expect(rows.map(row => row.id)).toEqual(['committee-35', 'unassigned-1', 'council-0'])
    })

    describe('findMeetingIdsMatching', () => {
        const reader = { includeUnreleased: false }

        test('ignores case and accents on both sides, newest first', async () => {
            expect(await findMeetingIdsMatching(archive.cityId, 'λογοδοσιας', reader, 'el', TZ)).toEqual(['council-24', 'council-12', 'council-0'])
            expect(await findMeetingIdsMatching(archive.cityId, 'ΛΟΓΟΔΟΣΊΑΣ', reader, 'el', TZ)).toEqual(['council-24', 'council-12', 'council-0'])
        })

        test('requires every word, in any order', async () => {
            expect(await findMeetingIdsMatching(archive.cityId, 'νικολαου αγιου', reader, 'el', TZ)).toEqual(['committee-0'])
            expect(await findMeetingIdsMatching(archive.cityId, 'αγιου νικολαου λογοδοσιας', reader, 'el', TZ)).toEqual([])
        })

        test('matches the English name', async () => {
            expect(await findMeetingIdsMatching(archive.cityId, 'accountability', reader, 'el', TZ)).toHaveLength(3)
        })

        test('matches the body name', async () => {
            expect(await findMeetingIdsMatching(archive.cityId, '1η δημοτικη κοινοτητα', reader, 'el', TZ)).toHaveLength(33)
        })

        test('matches the body name in both languages when the stored name leaves it out', async () => {
            // «Ειδική Συνεδρίαση Λογοδοσίας» names no body; its card and its body chip do.
            expect(await findMeetingIdsMatching(archive.cityId, 'λογοδοσιας δημοτικο συμβουλιο', reader, 'el', TZ)).toEqual(['council-24', 'council-12', 'council-0'])
            expect(await findMeetingIdsMatching(archive.cityId, 'accountability municipal council', reader, 'el', TZ)).toEqual(['council-24', 'council-12', 'council-0'])
        })

        test('never matches a word made of the end of one field and the start of the next', async () => {
            // council-0 is «Accountability Meeting 02/10/23», of the «Δημοτικό Συμβούλιο».
            expect(await findMeetingIdsMatching(archive.cityId, '23δημοτικο', reader, 'el', TZ)).toEqual([])
        })

        test('follows the body filter', async () => {
            const ids = await findMeetingIdsMatching(archive.cityId, 'δημοτικο συμβουλιο', { ...reader, administrativeBodyIds: [archive.bodies.council] }, 'el', TZ)
            expect(ids).not.toEqual(expect.arrayContaining([archive.unassignedIds[0]]))
            expect(await findMeetingIdsMatching(archive.cityId, 'δημοτικο συμβουλιο', reader, 'el', TZ)).toEqual(expect.arrayContaining(archive.unassignedIds))
        })

        test('finds unreleased meetings for an editor only', async () => {
            const unreleased = archive.unreleasedIds[0]
            expect(await findMeetingIdsMatching(archive.cityId, 'θεμα 1', reader, 'el', TZ)).not.toContain(unreleased)
            expect(await findMeetingIdsMatching(archive.cityId, 'θεμα 1', { includeUnreleased: true }, 'el', TZ)).toContain(unreleased)
        })

        test('matches the name in the script the reader sees, as the in-browser search did', async () => {
            await prisma.councilMeeting.create({
                data: { id: 'cyrillic-1', cityId: archive.cityId, name: 'Седница Скупштине 15/01/24', name_en: 'Assembly session 15/01/24', dateTime: new Date('2024-01-15T15:00:00Z'), released: true },
            })
            try {
                // A reader on /lat sees «Sednica Skupštine» and types it in Latin script.
                expect(await findMeetingIdsMatching(archive.cityId, 'sednica skupstine', reader, 'sr-Latn', TZ)).toEqual(['cyrillic-1'])
                expect(await findMeetingIdsMatching(archive.cityId, 'седница скупштине', reader, 'sr', TZ)).toEqual(['cyrillic-1'])
                // Greek and English pages never showed a transliteration, so they never matched one.
                expect(await findMeetingIdsMatching(archive.cityId, 'sednica skupstine', reader, 'el', TZ)).toEqual([])
            } finally {
                await prisma.councilMeeting.delete({ where: { cityId_id: { cityId: archive.cityId, id: 'cyrillic-1' } } })
            }
        })

        test('matches the title derived from the kind and number, as the card shows it', async () => {
            await prisma.councilMeeting.create({
                data: { id: 'derived-1', cityId: archive.cityId, name: null, name_en: null, kind: 'ordinary', sessionNumber: 3, administrativeBodyId: archive.bodies.council, dateTime: new Date('2024-03-11T15:00:00Z'), released: true },
            })
            try {
                expect(await findMeetingIdsMatching(archive.cityId, '3η τακτικη', reader, 'el', TZ)).toEqual(['derived-1'])
                expect(await findMeetingIdsMatching(archive.cityId, '3rd regular', reader, 'el', TZ)).toEqual(['derived-1'])
            } finally {
                await prisma.councilMeeting.delete({ where: { cityId_id: { cityId: archive.cityId, id: 'derived-1' } } })
            }
        })

        test('reports no search for a query with no words, so the list shows unfiltered', async () => {
            expect(await findMeetingIdsMatching(archive.cityId, '   ', reader, 'el', TZ)).toBeNull()
            // A lone combining accent normalizes to nothing.
            expect(await findMeetingIdsMatching(archive.cityId, '\u0301', reader, 'el', TZ)).toBeNull()
        })
    })

    describe('getCouncilMeetingPreviewsByIds', () => {
        afterEach(() => __setSessionEmail(null))

        test('hides the link to another meeting from a reader, and shows it to an editor', async () => {
            await prisma.councilMeeting.create({
                data: { id: 'continuation-1', cityId: archive.cityId, name: 'Συνέχεια', name_en: 'Continuation', administrativeBodyId: archive.bodies.council, continuationOfId: 'council-1', dateTime: new Date('2024-05-02T15:00:00Z'), released: true },
            })
            try {
                const [asReader] = await getCouncilMeetingPreviewsByIds(archive.cityId, ['continuation-1'])
                expect(asReader.continuationOfId).toBeNull()

                await signInAsSuperAdmin()
                const [asEditor] = await getCouncilMeetingPreviewsByIds(archive.cityId, ['continuation-1'])
                expect(asEditor.continuationOfId).toBe('council-1')
            } finally {
                await prisma.councilMeeting.delete({ where: { cityId_id: { cityId: archive.cityId, id: 'continuation-1' } } })
                await prisma.user.deleteMany({ where: { email: 'superadmin@integration.test' } })
            }
        })

        test('keeps unreleased meetings from a reader', async () => {
            expect(await getCouncilMeetingPreviewsByIds(archive.cityId, [archive.unreleasedIds[0]])).toEqual([])
        })

        test('shows a body admin the unreleased meetings of their body only', async () => {
            const ownDraft = archive.unreleasedIds.find(id => id.startsWith('committee-'))!
            const otherDraft = archive.unreleasedIds.find(id => id.startsWith('council-'))!
            const admin = await createUser('body-admin@integration.test')
            await prisma.administers.create({ data: { userId: admin.id, administrativeBodyId: archive.bodies.committee } })
            __setSessionEmail(admin.email)
            try {
                const rows = await getCouncilMeetingPreviewsByIds(archive.cityId, [ownDraft, otherDraft])
                expect(rows.map(row => row.id)).toEqual([ownDraft])
            } finally {
                await prisma.user.delete({ where: { id: admin.id } })
            }
        })
    })
})
