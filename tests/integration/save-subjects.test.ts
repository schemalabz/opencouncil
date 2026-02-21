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

function makeSubject(overrides: Partial<Subject> & { name: string; agendaItemIndex: Subject['agendaItemIndex'] }): Subject {
    return {
        description: 'Description',
        introducedByPersonId: null,
        speakerContributions: [],
        topicImportance: 'normal',
        proximityImportance: 'none',
        location: null,
        topicLabel: null,
        context: null,
        ...overrides,
    }
}

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
})
