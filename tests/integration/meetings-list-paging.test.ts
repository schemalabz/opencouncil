/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { countCouncilMeetings, getCouncilMeetingsWithSubjectPreview, type MeetingListOptions } from '@/lib/db/meetingsList'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import { buildMeetingArchive, MeetingArchive } from '../helpers/meetingArchive'

const PAGE_SIZE = 12

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
})
