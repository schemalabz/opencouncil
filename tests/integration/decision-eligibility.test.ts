/** @jest-environment node */

/**
 * DECISION_ELIGIBLE_SUBJECT_WHERE runs in Postgres; isRecordSubject runs in V8.
 * Nothing makes them agree by construction, and the eligibility docstring says
 * so and asks for them to be kept in step by hand. This test does the keeping:
 * it seeds every combination of the three fields the rule reads and asserts both
 * engines select the same rows.
 *
 * The rule the pair expresses is `isRecordSubject(subject) && !subject.withdrawn`
 * — the WHERE clause carries the withdrawn term, the in-memory rule leaves it to
 * its callers.
 *
 * Note: half of these rows are states the domain forbids — a beforeAgenda or
 * outOfAgenda subject has no agenda index. They are seeded deliberately, so the
 * two engines are pinned together even where the data should never go. Once a
 * CHECK constraint forbids them, drop those rows from this matrix.
 */

import prisma from '@/lib/db/prisma'
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from '@/lib/db/decisionEligibility'
import { isRecordSubject } from '@/lib/utils/subjects'
import { resetDatabase } from '../helpers/test-db'
import { createCity, createMeeting, createSubject } from '../helpers/factories'
import { NonAgendaReason } from '@prisma/client'

const INDICES = [null, 0, 3] as const
const REASONS = [null, NonAgendaReason.beforeAgenda, NonAgendaReason.outOfAgenda] as const
const WITHDRAWN = [false, true] as const

type Seeded = {
    id: string
    agendaItemIndex: number | null
    nonAgendaReason: NonAgendaReason | null
    withdrawn: boolean
}

describe('DECISION_ELIGIBLE_SUBJECT_WHERE matches isRecordSubject', () => {
    let seeded: Seeded[] = []

    beforeAll(async () => {
        await resetDatabase(prisma)
        const city = await createCity({ id: 'eligibility-city', name: 'Eligibility' })
        const meeting = await createMeeting(city.id, { id: 'eligibility-meeting' })

        seeded = []
        for (const agendaItemIndex of INDICES) {
            for (const nonAgendaReason of REASONS) {
                for (const withdrawn of WITHDRAWN) {
                    const id = `s-${agendaItemIndex ?? 'null'}-${nonAgendaReason ?? 'null'}-${withdrawn}`
                    await createSubject(meeting.id, city.id, { id, agendaItemIndex, nonAgendaReason, withdrawn })
                    seeded.push({ id, agendaItemIndex, nonAgendaReason, withdrawn })
                }
            }
        }
    })

    it('seeds every combination of the three fields the rule reads', () => {
        expect(seeded).toHaveLength(INDICES.length * REASONS.length * WITHDRAWN.length)
    })

    it('selects in Postgres exactly what the in-memory rule selects', async () => {
        const fromDb = await prisma.subject.findMany({
            where: DECISION_ELIGIBLE_SUBJECT_WHERE,
            select: { id: true },
        })
        const inMemory = seeded.filter(s => isRecordSubject(s) && !s.withdrawn)

        expect([...fromDb.map(r => r.id)].sort()).toEqual([...inMemory.map(s => s.id)].sort())
    })

    it('agrees row by row, so a divergence names the row that broke', async () => {
        const eligibleIds = new Set(
            (await prisma.subject.findMany({ where: DECISION_ELIGIBLE_SUBJECT_WHERE, select: { id: true } }))
                .map(r => r.id),
        )

        for (const s of seeded) {
            expect({ id: s.id, sql: eligibleIds.has(s.id) })
                .toEqual({ id: s.id, sql: isRecordSubject(s) && !s.withdrawn })
        }
    })
})
