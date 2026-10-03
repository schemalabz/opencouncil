/** @jest-environment node */

/**
 * The meeting's subject payload reaches the browser on every meeting page, so it
 * carries the decision without its stored reading. The minutes read the reading
 * on the server through getDecisionReadingsForMeeting.
 */

import prisma from '@/lib/db/prisma'
import { getSubjectsForMeeting } from '@/lib/db/subject'
import { getDecisionReadingsForMeeting } from '@/lib/db/decisionFacts'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createSubject } from '../helpers/factories'

describe('subject payload and the stored reading', () => {
    const reading = { presidedBy: { name: 'Πρόεδρος', personId: null }, attendanceChanges: [] }

    beforeAll(async () => {
        await resetDatabase(prisma)
        const city = await createCity({ id: 'payload-city', name: 'Payload' })
        const meeting = await createMeeting(city.id, { id: 'payload-meeting' })
        const subject = await createSubject(meeting.id, city.id, { id: 'payload-subject', agendaItemIndex: 1 })
        await prisma.decision.create({
            data: {
                subjectId: subject.id, ada: 'ΑΒΓΔΩ1-ΕΖΗ', decisionNumber: '12/2026', pdfUrl: 'https://diavgeia.gov.gr/doc/ΑΒΓΔΩ1-ΕΖΗ',
                excerpt: 'ΑΠΟΦΑΣΙΖΕΙ', extractorVersion: '4', extraction: reading,
            },
        })
    })

    it('leaves the stored reading out of the meeting subjects', async () => {
        const [subject] = await getSubjectsForMeeting('payload-city', 'payload-meeting')
        expect(subject.decision).toMatchObject({ ada: 'ΑΒΓΔΩ1-ΕΖΗ', decisionNumber: '12/2026', excerpt: 'ΑΠΟΦΑΣΙΖΕΙ', extractorVersion: '4' })
        expect(subject.decision).not.toHaveProperty('extraction')
    })

    it('returns the stored reading by subject for server code', async () => {
        const readings = await getDecisionReadingsForMeeting('payload-city', 'payload-meeting')
        expect(readings.get('payload-subject')).toEqual({ extraction: reading, extractorVersion: '4' })
    })
})
