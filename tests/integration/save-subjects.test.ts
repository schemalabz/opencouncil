/** @jest-environment node */
import prisma from '@/lib/db/prisma'
import { saveSubjectsForMeeting } from '@/lib/db/utils'
import { Subject } from '@/lib/apiTypes'
import { ensureTestDb, resetDatabase } from '../helpers/test-db'
import {
    createAdministrativeBody,
    createCity,
    createMeeting,
    createTopic,
} from '../helpers/factories'
import { makeSubject } from '../helpers/builders'

describe('saveSubjectsForMeeting - integration', () => {
    let cityId: string
    let meetingId: string

    beforeAll(async () => {
        await ensureTestDb()
    })

    beforeEach(async () => {
        await resetDatabase(prisma as any)

        const city = await createCity({ id: 'c1' })
        cityId = city.id
        const body = await createAdministrativeBody(cityId)
        const meeting = await createMeeting(cityId, { id: 'm1', administrativeBodyId: body.id })
        meetingId = meeting.id
    })

    test('first run: creates all subjects with correct fields', async () => {
        const incoming: Subject[] = [
            makeSubject({ name: 'Budget discussion', agendaItemIndex: 1, description: 'About the budget' }),
            makeSubject({ name: 'Parks maintenance', agendaItemIndex: 2, description: 'About parks' }),
        ]

        const idMap = await saveSubjectsForMeeting(incoming, cityId, meetingId)

        const dbSubjects = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })

        expect(dbSubjects).toHaveLength(2)
        expect(dbSubjects[0].name).toBe('Budget discussion')
        expect(dbSubjects[0].description).toBe('About the budget')
        expect(dbSubjects[0].agendaItemIndex).toBe(1)
        expect(dbSubjects[1].name).toBe('Parks maintenance')
        expect(dbSubjects[1].agendaItemIndex).toBe(2)

        // idMap should contain entries for both subjects
        expect(idMap.size).toBe(2)
        expect(idMap.get('Budget discussion')).toBe(dbSubjects[0].id)
        expect(idMap.get('Parks maintenance')).toBe(dbSubjects[1].id)
    })

    test('second run: matched subjects preserve their database IDs', async () => {
        // First run (simulates processAgenda)
        const initial: Subject[] = [
            makeSubject({ name: 'Budget', agendaItemIndex: 1 }),
            makeSubject({ name: 'Roads', agendaItemIndex: 2 }),
            makeSubject({ name: 'Parks', agendaItemIndex: 3 }),
        ]
        await saveSubjectsForMeeting(initial, cityId, meetingId)

        const afterFirstRun = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })
        const originalIds = afterFirstRun.map(s => s.id)

        // Second run (simulates summarize) — updates items 1 and 3, adds a new one
        const updated: Subject[] = [
            makeSubject({ name: 'Budget - updated', agendaItemIndex: 1, description: 'Updated description' }),
            makeSubject({ name: 'Parks - updated', agendaItemIndex: 3 }),
            makeSubject({ name: 'New topic', agendaItemIndex: 5 }),
        ]
        await saveSubjectsForMeeting(updated, cityId, meetingId)

        const afterSecondRun = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: [{ agendaItemIndex: { sort: 'asc', nulls: 'last' } }],
        })

        // Should have 4 total: 3 original + 1 new
        expect(afterSecondRun).toHaveLength(4)

        // Item 1: ID preserved, fields updated
        const item1 = afterSecondRun.find(s => s.agendaItemIndex === 1)!
        expect(item1.id).toBe(originalIds[0])
        expect(item1.name).toBe('Budget - updated')
        expect(item1.description).toBe('Updated description')

        // Item 2: untouched (not in incoming set) — ID and fields preserved
        const item2 = afterSecondRun.find(s => s.agendaItemIndex === 2)!
        expect(item2.id).toBe(originalIds[1])
        expect(item2.name).toBe('Roads')

        // Item 3: ID preserved, name updated
        const item3 = afterSecondRun.find(s => s.agendaItemIndex === 3)!
        expect(item3.id).toBe(originalIds[2])
        expect(item3.name).toBe('Parks - updated')

        // Item 5: new subject with new ID
        const item5 = afterSecondRun.find(s => s.agendaItemIndex === 5)!
        expect(item5.name).toBe('New topic')
        expect(originalIds).not.toContain(item5.id)
    })

    test('unmatched existing subjects are never deleted', async () => {
        // Create 3 subjects
        const initial: Subject[] = [
            makeSubject({ name: 'Item A', agendaItemIndex: 1 }),
            makeSubject({ name: 'Item B', agendaItemIndex: 2 }),
            makeSubject({ name: 'Item C', agendaItemIndex: 3 }),
        ]
        await saveSubjectsForMeeting(initial, cityId, meetingId)

        // Second run sends only 1 subject that doesn't match any existing
        const updated: Subject[] = [
            makeSubject({ name: 'Completely new', agendaItemIndex: 99 }),
        ]
        await saveSubjectsForMeeting(updated, cityId, meetingId)

        const all = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
        })

        // All 3 original + 1 new = 4 total
        expect(all).toHaveLength(4)
    })

    test('BEFORE_AGENDA and OUT_OF_AGENDA subjects are replaced, not accumulated', async () => {
        // First run with numeric + non-agenda subjects
        const initial: Subject[] = [
            makeSubject({ name: 'Item 1', agendaItemIndex: 1 }),
            makeSubject({ name: 'Opening remarks v1', agendaItemIndex: 'BEFORE_AGENDA' }),
            makeSubject({ name: 'Misc discussion v1', agendaItemIndex: 'OUT_OF_AGENDA' }),
        ]
        await saveSubjectsForMeeting(initial, cityId, meetingId)

        const afterFirst = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
        })
        expect(afterFirst).toHaveLength(3)

        // Second run: updated non-agenda subjects (should replace, not accumulate)
        const updated: Subject[] = [
            makeSubject({ name: 'Item 1 updated', agendaItemIndex: 1 }),
            makeSubject({ name: 'Opening remarks v2', agendaItemIndex: 'BEFORE_AGENDA' }),
            makeSubject({ name: 'Misc discussion v2', agendaItemIndex: 'OUT_OF_AGENDA' }),
        ]
        await saveSubjectsForMeeting(updated, cityId, meetingId)

        const all = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
        })

        // 1 updated + 2 replaced = 3 total (NOT 5 from accumulation)
        expect(all).toHaveLength(3)

        const beforeAgenda = all.filter(s => s.nonAgendaReason === 'beforeAgenda')
        expect(beforeAgenda).toHaveLength(1)
        expect(beforeAgenda[0].name).toBe('Opening remarks v2')

        const outOfAgenda = all.filter(s => s.nonAgendaReason === 'outOfAgenda')
        expect(outOfAgenda).toHaveLength(1)
        expect(outOfAgenda[0].name).toBe('Misc discussion v2')
    })

    test('contributions are replaced on update', async () => {
        // Create a person for speaker contributions
        const person = await prisma.person.create({
            data: {
                name: 'John Doe',
                name_en: 'John Doe',
                name_short: 'J. Doe',
                name_short_en: 'J. Doe',
                cityId,
            },
        })

        // First run with contributions
        const initial: Subject[] = [
            makeSubject({
                name: 'Budget',
                agendaItemIndex: 1,
                speakerContributions: [
                    { speakerId: person.id, speakerName: 'John Doe', text: 'Initial position' },
                ],
            }),
        ]
        await saveSubjectsForMeeting(initial, cityId, meetingId)

        const subjectAfterFirst = await prisma.subject.findFirst({
            where: { councilMeetingId: meetingId, agendaItemIndex: 1 },
        })
        const contribsAfterFirst = await prisma.speakerContribution.findMany({
            where: { subjectId: subjectAfterFirst!.id },
        })
        expect(contribsAfterFirst).toHaveLength(1)
        expect(contribsAfterFirst[0].text).toBe('Initial position')

        // Second run with different contributions (same subject via agendaItemIndex match)
        const updated: Subject[] = [
            makeSubject({
                name: 'Budget - discussed',
                agendaItemIndex: 1,
                speakerContributions: [
                    { speakerId: person.id, speakerName: 'John Doe', text: 'Updated position on budget' },
                    { speakerId: null, speakerName: 'Unknown Speaker', text: 'A comment from the audience' },
                ],
            }),
        ]
        await saveSubjectsForMeeting(updated, cityId, meetingId)

        // Same subject ID
        const subjectAfterSecond = await prisma.subject.findFirst({
            where: { councilMeetingId: meetingId, agendaItemIndex: 1 },
        })
        expect(subjectAfterSecond!.id).toBe(subjectAfterFirst!.id)

        // Contributions replaced — old ones gone, new ones present
        const contribsAfterSecond = await prisma.speakerContribution.findMany({
            where: { subjectId: subjectAfterSecond!.id },
            orderBy: { createdAt: 'asc' },
        })
        expect(contribsAfterSecond).toHaveLength(2)
        expect(contribsAfterSecond[0].text).toBe('Updated position on budget')
        expect(contribsAfterSecond[1].text).toBe('A comment from the audience')
    })

    test('highlights on unmatched subjects are preserved', async () => {
        // Create two subjects
        const initial: Subject[] = [
            makeSubject({ name: 'Item 1', agendaItemIndex: 1 }),
            makeSubject({ name: 'Item 2', agendaItemIndex: 2 }),
        ]
        await saveSubjectsForMeeting(initial, cityId, meetingId)

        // Manually create a highlight on Item 2 (simulating a previous summarize)
        const item2 = await prisma.subject.findFirst({
            where: { councilMeetingId: meetingId, agendaItemIndex: 2 },
        })
        await prisma.highlight.create({
            data: {
                name: 'Item 2 highlight',
                meetingId,
                cityId,
                subjectId: item2!.id,
            },
        })

        // Second run only touches Item 1 — Item 2 is unmatched
        const updated: Subject[] = [
            makeSubject({ name: 'Item 1 updated', agendaItemIndex: 1 }),
        ]
        await saveSubjectsForMeeting(updated, cityId, meetingId)

        // Item 2's highlight should still exist
        const highlights = await prisma.highlight.findMany({
            where: { meetingId, cityId },
        })
        expect(highlights).toHaveLength(1)
        expect(highlights[0].subjectId).toBe(item2!.id)
        expect(highlights[0].name).toBe('Item 2 highlight')
    })

    test('topic label is linked when it exists', async () => {
        const topic = await createTopic('t1', { name: 'Environment', name_en: 'Environment' })

        const subjects: Subject[] = [
            makeSubject({ name: 'Green spaces', agendaItemIndex: 1, topicLabel: 'Environment' }),
            makeSubject({ name: 'Budget', agendaItemIndex: 2, topicLabel: 'NonExistentTopic' }),
        ]
        await saveSubjectsForMeeting(subjects, cityId, meetingId)

        const dbSubjects = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })

        expect(dbSubjects[0].topicId).toBe(topic.id)
        expect(dbSubjects[1].topicId).toBeNull()
    })

    test('invalid introducedByPersonId is ignored with warning', async () => {
        const subjects: Subject[] = [
            makeSubject({
                name: 'Item 1',
                agendaItemIndex: 1,
                introducedByPersonId: 'nonexistent-person-id',
            }),
        ]

        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
        await saveSubjectsForMeeting(subjects, cityId, meetingId)
        consoleSpy.mockRestore()

        const dbSubject = await prisma.subject.findFirst({
            where: { councilMeetingId: meetingId },
        })
        expect(dbSubject!.personId).toBeNull()
    })

    test('idempotent: running same subjects twice produces same IDs', async () => {
        const subjects: Subject[] = [
            makeSubject({ name: 'Item 1', agendaItemIndex: 1 }),
            makeSubject({ name: 'Item 2', agendaItemIndex: 2 }),
        ]

        await saveSubjectsForMeeting(subjects, cityId, meetingId)
        const firstRunIds = (await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })).map(s => s.id)

        await saveSubjectsForMeeting(subjects, cityId, meetingId)
        const secondRunIds = (await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: { agendaItemIndex: 'asc' },
        })).map(s => s.id)

        expect(secondRunIds).toEqual(firstRunIds)
    })

    test('agendaItemTitle: stored on create, kept when a later run omits it, replaced when present, cleared by null', async () => {
        // processAgenda run: every subject carries the field.
        const agendaRun: Subject[] = [
            makeSubject({ name: 'Budget', agendaItemIndex: 1, agendaItemTitle: 'ΕΓΚΡΙΣΗ ΠΡΟΫΠΟΛΟΓΙΣΜΟΥ ΟΙΚΟΝΟΜΙΚΟΥ ΕΤΟΥΣ 2026' }),
            makeSubject({ name: 'Roads', agendaItemIndex: 2, agendaItemTitle: 'ΣΥΝΤΗΡΗΣΗ ΟΔΙΚΟΥ ΔΙΚΤΥΟΥ' }),
        ]
        await saveSubjectsForMeeting(agendaRun, cityId, meetingId, undefined, { pruneUnmatched: true })

        const afterAgenda = await prisma.subject.findMany({ where: { councilMeetingId: meetingId, cityId }, orderBy: { agendaItemIndex: 'asc' } })
        expect(afterAgenda[0].agendaItemTitle).toBe('ΕΓΚΡΙΣΗ ΠΡΟΫΠΟΛΟΓΙΣΜΟΥ ΟΙΚΟΝΟΜΙΚΟΥ ΕΤΟΥΣ 2026')
        expect(afterAgenda[1].agendaItemTitle).toBe('ΣΥΝΤΗΡΗΣΗ ΟΔΙΚΟΥ ΔΙΚΤΥΟΥ')

        // summarize run: renames the subject and omits the field.
        const summarizeRun: Subject[] = [
            makeSubject({ name: 'Budget 2026 approved', agendaItemIndex: 1, description: 'Discussed at length' }),
        ]
        await saveSubjectsForMeeting(summarizeRun, cityId, meetingId)

        const afterSummarize = await prisma.subject.findUnique({ where: { id: afterAgenda[0].id } })
        expect(afterSummarize!.name).toBe('Budget 2026 approved')
        expect(afterSummarize!.agendaItemTitle).toBe('ΕΓΚΡΙΣΗ ΠΡΟΫΠΟΛΟΓΙΣΜΟΥ ΟΙΚΟΝΟΜΙΚΟΥ ΕΤΟΥΣ 2026')

        const roadsAfterSummarize = await prisma.subject.findUnique({ where: { id: afterAgenda[1].id } })
        expect(roadsAfterSummarize!.agendaItemTitle).toBe('ΣΥΝΤΗΡΗΣΗ ΟΔΙΚΟΥ ΔΙΚΤΥΟΥ')

        // A second agenda run replaces the title, and an explicit null clears it.
        const secondAgendaRun: Subject[] = [
            makeSubject({ name: 'Budget 2026 approved', agendaItemIndex: 1, agendaItemTitle: 'ΕΓΚΡΙΣΗ ΠΡΟΫΠΟΛΟΓΙΣΜΟΥ 2026 (ΟΡΘΗ ΕΠΑΝΑΛΗΨΗ)' }),
            makeSubject({ name: 'Roads', agendaItemIndex: 2, agendaItemTitle: null }),
        ]
        await saveSubjectsForMeeting(secondAgendaRun, cityId, meetingId, undefined, { pruneUnmatched: true })

        const afterSecond = await prisma.subject.findMany({ where: { councilMeetingId: meetingId, cityId }, orderBy: { agendaItemIndex: 'asc' } })
        expect(afterSecond[0].id).toBe(afterAgenda[0].id)
        expect(afterSecond[0].agendaItemTitle).toBe('ΕΓΚΡΙΣΗ ΠΡΟΫΠΟΛΟΓΙΣΜΟΥ 2026 (ΟΡΘΗ ΕΠΑΝΑΛΗΨΗ)')
        expect(afterSecond[1].id).toBe(afterAgenda[1].id)
        expect(afterSecond[1].agendaItemTitle).toBeNull()
    })

    test('agendaItemTitle: a subject created without the field stores null', async () => {
        const run: Subject[] = [makeSubject({ name: 'Opening remarks', agendaItemIndex: 'BEFORE_AGENDA' })]
        await saveSubjectsForMeeting(run, cityId, meetingId)

        const rows = await prisma.subject.findMany({ where: { councilMeetingId: meetingId, cityId } })
        expect(rows).toHaveLength(1)
        expect(rows[0].agendaItemTitle).toBeNull()
    })

    test('agendaSection: stored on create, kept when a later run omits it, matched by pair, cleared by null', async () => {
        // processAgenda run on a two-section agenda where both sections start at 1.
        const agendaRun: Subject[] = [
            makeSubject({ name: 'Γλυπτό «Έφηβος»', agendaItemIndex: 1, agendaSection: { index: 1, title: 'ΓΕΝΙΚΑ ΘΕΜΑΤΑ' } }),
            makeSubject({ name: 'Στρατηγική Στέγης', agendaItemIndex: 2, agendaSection: { index: 1, title: 'ΓΕΝΙΚΑ ΘΕΜΑΤΑ' } }),
            makeSubject({ name: 'Άδεια μουσικής «Παρέα»', agendaItemIndex: 1, agendaSection: { index: 2, title: 'ΠΑΡΑΤΑΣΕΙΣ ΩΡΑΡΙΟΥ ΜΟΥΣΙΚΗΣ' } }),
        ]
        await saveSubjectsForMeeting(agendaRun, cityId, meetingId, undefined, { pruneUnmatched: true })

        const afterAgenda = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            orderBy: [{ agendaSectionIndex: 'asc' }, { agendaItemIndex: 'asc' }],
        })
        expect(afterAgenda).toHaveLength(3)
        expect(afterAgenda.map(s => [s.agendaSectionIndex, s.agendaItemIndex, s.agendaSectionTitle])).toEqual([
            [1, 1, 'ΓΕΝΙΚΑ ΘΕΜΑΤΑ'],
            [1, 2, 'ΓΕΝΙΚΑ ΘΕΜΑΤΑ'],
            [2, 1, 'ΠΑΡΑΤΑΣΕΙΣ ΩΡΑΡΙΟΥ ΜΟΥΣΙΚΗΣ'],
        ])
        const musicId = afterAgenda[2].id

        // A run that rewords the name and sends no id: the pair (2, 1) finds the row,
        // and a sent section replaces the stored title.
        const summarizeRun: Subject[] = [
            makeSubject({ name: 'Ανάκληση άδειας μουσικής «Παρέα»', agendaItemIndex: 1, agendaSection: { index: 2, title: 'ΠΑΡΑΤΑΣΕΙΣ (re-sent)' } }),
        ]
        await saveSubjectsForMeeting(summarizeRun, cityId, meetingId)

        const music = await prisma.subject.findUnique({ where: { id: musicId } })
        expect(music!.name).toBe('Ανάκληση άδειας μουσικής «Παρέα»')
        expect(music!.agendaSectionIndex).toBe(2)
        expect(music!.agendaSectionTitle).toBe('ΠΑΡΑΤΑΣΕΙΣ (re-sent)')

        // A summarize run without the field leaves the section alone.
        const plainSummarizeRun: Subject[] = [
            makeSubject({ id: musicId, name: 'Άδεια μουσικής «Παρέα» — συζήτηση', agendaItemIndex: 1 }),
        ]
        await saveSubjectsForMeeting(plainSummarizeRun, cityId, meetingId)

        const musicAgain = await prisma.subject.findUnique({ where: { id: musicId } })
        expect(musicAgain!.name).toBe('Άδεια μουσικής «Παρέα» — συζήτηση')
        expect(musicAgain!.agendaSectionIndex).toBe(2)
        expect(musicAgain!.agendaSectionTitle).toBe('ΠΑΡΑΤΑΣΕΙΣ (re-sent)')

        // An agenda run that now has one list clears the section with null.
        const oneListRun: Subject[] = [
            makeSubject({ name: 'Γλυπτό «Έφηβος»', agendaItemIndex: 1, agendaSection: null }),
        ]
        await saveSubjectsForMeeting(oneListRun, cityId, meetingId, undefined, { pruneUnmatched: true })

        const rows = await prisma.subject.findMany({ where: { councilMeetingId: meetingId, cityId } })
        expect(rows).toHaveLength(1)
        expect(rows[0].id).toBe(afterAgenda[0].id)
        expect(rows[0].agendaSectionIndex).toBeNull()
        expect(rows[0].agendaSectionTitle).toBeNull()
    })

    test('summarize by id: three subjects at the same number, all reworded, every row keeps its id and gains contributions', async () => {
        const agendaRun: Subject[] = [
            makeSubject({ name: 'Τροποποίηση τεχνικού προγράμματος 2026', agendaItemIndex: 1 }),
            makeSubject({ name: 'Στρατηγικός σχεδιασμός καθαριότητας', agendaItemIndex: 1 }),
            makeSubject({ name: 'Ψήφισμα για ΙΔΟΧ προσωπικό', agendaItemIndex: 1 }),
        ]
        await saveSubjectsForMeeting(agendaRun, cityId, meetingId, undefined, { pruneUnmatched: true })
        const rows = await prisma.subject.findMany({ where: { councilMeetingId: meetingId, cityId }, orderBy: { name: 'asc' } })
        expect(rows).toHaveLength(3)

        // Send the rows in an order that is neither the name order nor the id
        // order, so only the id can put each summary back on its own row: the
        // three rows share one (null, 1) slot, and every name is reworded, so
        // neither of the later passes can reproduce this mapping (issue 366).
        const scrambled = [...rows].sort((a, b) => b.name.localeCompare(a.name, 'el'))
        const summarizeRun: Subject[] = scrambled.map(r => makeSubject({
            id: r.id,
            name: `${r.name} (συζήτηση)`,
            agendaItemIndex: 1,
            speakerContributions: [{ speakerId: null, speakerName: 'Ομιλητής', text: `Τοποθέτηση για ${r.name}` }],
        }))
        const byName = rows.map(r => r.id)
        const byId = [...rows].map(r => r.id).sort()
        expect(summarizeRun.map(s => s.id)).not.toEqual(byName)
        expect(summarizeRun.map(s => s.id)).not.toEqual(byId)

        await saveSubjectsForMeeting(summarizeRun, cityId, meetingId)

        const after = await prisma.subject.findMany({
            where: { councilMeetingId: meetingId, cityId },
            include: { contributions: true },
            orderBy: { id: 'asc' },
        })
        expect(after).toHaveLength(3)
        expect(after.map(s => s.id)).toEqual(byId)

        // Per row: the summary landed on the row it names, not just somewhere.
        const afterById = new Map(after.map(s => [s.id, s]))
        for (const row of rows) {
            const updated = afterById.get(row.id)!
            expect(updated.name).toBe(`${row.name} (συζήτηση)`)
            expect(updated.contributions.map(c => c.text)).toEqual([`Τοποθέτηση για ${row.name}`])
        }
    })

    describe('the location of a subject of a region (#993)', () => {
        // A square: longitude 22 to 23, latitude 39 to 40.
        const SQUARE = {
            type: 'Polygon',
            coordinates: [[[22, 39], [23, 39], [23, 40], [22, 40], [22, 39]]],
        }
        const point = (text: string, lng: number, lat: number): Subject['location'] =>
            ({ type: 'point', text, coordinates: [[lng, lat]] })
        const INSIDE = point('Κεντρική πλατεία', 22.42, 39.64)
        // The two points are on each side of the 1 km tolerance, so the test fixes its value.
        // About 900 m east of the east side: inside the tolerance for a coast.
        const NEAR = point('Λιμάνι', 23.0105, 39.5)
        // About 1100 m east of the east side.
        const PAST = point('Νησίδα', 23.0128, 39.5)
        const FAR = point('Κεντρική πλατεία', 23.73, 37.98)

        async function createAuthority(id: string, authorityType: 'municipality' | 'region', boundary: object | null = SQUARE) {
            await createCity({ id, authorityType })
            if (boundary) {
                await prisma.$executeRaw`
                    UPDATE "City" SET geometry = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(boundary)}), 4326) WHERE id = ${id}`
            }
            const body = await createAdministrativeBody(id)
            const meeting = await createMeeting(id, { id: `${id}-m1`, administrativeBodyId: body.id })
            return meeting.id
        }

        async function locationTextsByName(authorityId: string, meeting: string) {
            const rows = await prisma.subject.findMany({
                where: { cityId: authorityId, councilMeetingId: meeting },
                select: { name: true, location: { select: { text: true } } },
            })
            return Object.fromEntries(rows.map(row => [row.name, row.location?.text ?? null]))
        }

        // The subject with no location is first: the place of a subject among
        // the located subjects is then not its place in the list.
        const incoming = () => [
            makeSubject({ name: 'None', agendaItemIndex: 1 }),
            makeSubject({ name: 'Inside', agendaItemIndex: 2, location: INSIDE }),
            makeSubject({ name: 'Near', agendaItemIndex: 3, location: NEAR }),
            makeSubject({ name: 'Past', agendaItemIndex: 4, location: PAST }),
            makeSubject({ name: 'Far', agendaItemIndex: 5, location: FAR }),
        ]

        test('keeps a location in the region and drops a location outside it', async () => {
            const meeting = await createAuthority('r1', 'region')
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

            await saveSubjectsForMeeting(incoming(), 'r1', meeting)

            expect(await locationTextsByName('r1', meeting)).toEqual({
                Inside: 'Κεντρική πλατεία', Near: 'Λιμάνι', Past: null, Far: null, None: null,
            })
            // The subject stays: only its pin goes.
            expect(await prisma.subject.count({ where: { cityId: 'r1' } })).toBe(5)
            expect(await prisma.location.count()).toBe(2)
            expect(warn.mock.calls.map(call => String(call[0])).filter(line => line.includes('outside the boundary')))
                .toHaveLength(2)
            warn.mockRestore()
        })

        test('clears the stored location when a later run moves it out of the region', async () => {
            const meeting = await createAuthority('r1', 'region')
            await saveSubjectsForMeeting([makeSubject({ name: 'Road', agendaItemIndex: 1, location: INSIDE })], 'r1', meeting)
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

            await saveSubjectsForMeeting([makeSubject({ name: 'Road', agendaItemIndex: 1, location: FAR })], 'r1', meeting)

            expect(await locationTextsByName('r1', meeting)).toEqual({ Road: null })
            warn.mockRestore()
        })

        test('keeps each location of a municipality, as before', async () => {
            const meeting = await createAuthority('m1', 'municipality')

            await saveSubjectsForMeeting(incoming(), 'm1', meeting)

            expect(await locationTextsByName('m1', meeting)).toEqual({
                Inside: 'Κεντρική πλατεία', Near: 'Λιμάνι', Past: 'Νησίδα', Far: 'Κεντρική πλατεία', None: null,
            })
        })

        test('keeps a location on each part of a boundary of many parts', async () => {
            // The square and an island 85 km east of it.
            const island = [[[24, 39.4], [24.1, 39.4], [24.1, 39.5], [24, 39.5], [24, 39.4]]]
            const meeting = await createAuthority('r3', 'region', { type: 'MultiPolygon', coordinates: [SQUARE.coordinates, island] })
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

            await saveSubjectsForMeeting([
                makeSubject({ name: 'Mainland', agendaItemIndex: 1, location: INSIDE }),
                makeSubject({ name: 'Island', agendaItemIndex: 2, location: point('Χώρα', 24.05, 39.45) }),
                makeSubject({ name: 'Sea', agendaItemIndex: 3, location: point('Ανοιχτή θάλασσα', 23.5, 39.45) }),
            ], 'r3', meeting)

            expect(await locationTextsByName('r3', meeting)).toEqual({ Mainland: 'Κεντρική πλατεία', Island: 'Χώρα', Sea: null })
            warn.mockRestore()
        })

        test('keeps each location of a region that has no boundary', async () => {
            const meeting = await createAuthority('r2', 'region', null)

            await saveSubjectsForMeeting(incoming(), 'r2', meeting)

            expect(await locationTextsByName('r2', meeting)).toEqual({
                Inside: 'Κεντρική πλατεία', Near: 'Λιμάνι', Past: 'Νησίδα', Far: 'Κεντρική πλατεία', None: null,
            })
        })
    })
})
