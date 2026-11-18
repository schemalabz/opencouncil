/** @jest-environment node */
// pollDecisionsForMeeting is where every poll arrives (the cron, the
// follow-ups, the admin batch, the subject page). Its guard reads the tier
// through the select of the meeting; no test runs it on a secondary body.
jest.mock('@/lib/tasks/generateHighlight', () => ({ handleGenerateHighlightResult: jest.fn() }))

import prisma from '@/lib/db/prisma'
import { pollDecisionsForMeeting } from '@/lib/tasks/pollDecisions'
import { resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createSubject } from '../helpers/factories'

const CITY = 'c1'

test('a direct decision poll refuses an ordinary meeting of a secondary body, before a task is created (#829)', async () => {
    await resetDatabase(prisma)
    await createCity({ id: CITY, diavgeiaUid: 'DIAV-1', status: 'supported' })
    const youth = await createAdministrativeBody(CITY, { type: 'youthCouncil', name: 'Συμβούλιο Νέων', name_en: 'Youth Council' })
    await createMeeting(CITY, { id: 'youth', dateTime: new Date('2026-03-12T16:00:00Z'), administrativeBodyId: youth.id, kind: 'ordinary', scheduleStatus: 'scheduled' })
    await createSubject('youth', CITY, { agendaItemIndex: 1 })

    await expect(pollDecisionsForMeeting(CITY, 'youth')).rejects.toThrow(/takes no decisions/)
    expect(await prisma.taskStatus.count({ where: { type: 'pollDecisions' } })).toBe(0)
})
