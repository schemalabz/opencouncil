/** @jest-environment node */
import fs from 'fs'
import path from 'path'
import type { MeetingKind } from '@prisma/client'
import prisma from '@/lib/db/prisma'
import { meetingDisplayName } from '@/lib/meetingName'
import { splitSqlStatements } from '../helpers/sql'

const MIGRATION = path.join(
    __dirname,
    '../../prisma/migrations/20260924215035_meeting_lifecycle/migration.sql',
)

const KINDS: Array<MeetingKind | null> = [null, 'regular', 'urgent', 'accountability', 'annualReport', 'budget', 'presidencyElection']
const BODIES = [{ name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council' }, null]
const DATES = [
    new Date('2026-03-12T16:00:00Z'),
    // Before midnight UTC, after midnight in Athens (summer time).
    new Date('2026-06-25T22:30:00Z'),
    // Before midnight UTC, after midnight in Athens (winter time).
    new Date('2026-01-07T22:15:00Z'),
]

/** The SQL function, which the Notis view calls, and the TypeScript function
 *  must print the same Greek name. Both carry the kind labels by hand. */
describe('council_meeting_display_name', () => {
    beforeAll(async () => {
        const [fn] = splitSqlStatements(fs.readFileSync(MIGRATION, 'utf8'))
            .filter((s) => s.includes('CREATE OR REPLACE FUNCTION council_meeting_display_name'))
        await prisma.$executeRawUnsafe(fn)
    })

    async function sqlName(kind: MeetingKind | null, bodyName: string | null, dateTime: Date, override: string | null = null, sessionZone = 'UTC') {
        // The column is a timestamp without zone that holds UTC, which is how
        // Prisma writes it. Pass the same value. The session zone must not
        // change the result, so the test sets one in the same transaction.
        const utc = dateTime.toISOString().replace('T', ' ').replace('Z', '')
        return prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${sessionZone}'`)
            const [row] = await tx.$queryRawUnsafe<Array<{ name: string }>>(
                `SELECT council_meeting_display_name($1, $2::"MeetingKind", $3, $4::timestamp, 'Europe/Athens', 'el') AS name`,
                override, kind, bodyName, utc,
            )
            return row.name
        })
    }

    test.each(['UTC', 'America/New_York'])('equals meetingDisplayName for every kind, body and date (session zone %s)', async (zone) => {
        for (const kind of KINDS) {
            for (const body of BODIES) {
                for (const dateTime of DATES) {
                    const expected = meetingDisplayName(
                        { name: null, name_en: null, kind, dateTime, administrativeBody: body },
                        'el',
                        'Europe/Athens',
                    )
                    expect(await sqlName(kind, body?.name ?? null, dateTime, null, zone)).toBe(expected)
                }
            }
        }
    })

    test('returns the override as it is, and reads an empty override as none', async () => {
        expect(await sqlName('accountability', 'Δημοτικό Συμβούλιο', DATES[0], 'Κοινή Συνεδρίαση')).toBe('Κοινή Συνεδρίαση')
        const empty = { name: '', name_en: null, kind: 'accountability' as const, dateTime: DATES[0], administrativeBody: BODIES[0] }
        expect(await sqlName('accountability', 'Δημοτικό Συμβούλιο', DATES[0], '')).toBe(meetingDisplayName(empty, 'el', 'Europe/Athens'))
    })
})
