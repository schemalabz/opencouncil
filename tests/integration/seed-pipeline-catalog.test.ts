import { Client } from 'pg'
import { ensureTestDb, ensureMigrationsTable } from '../helpers/test-db'
import {
    constraintExists,
    fksOfTables,
    listForeignKeys,
    listPgSyncObjects,
    listTables,
    migrationHead,
    misorderedCompositeFks,
    primaryKeyColumns,
    selfReferencingFks,
    tableRowCounts,
} from '@opencouncil/seed-pipeline/catalog'

let client: Client

beforeAll(async () => {
    const { databaseUrl } = await ensureTestDb()
    await ensureMigrationsTable(databaseUrl)
    client = new Client({ connectionString: databaseUrl })
    // A server that goes away under an open client (Ctrl-C, or Ryuk removing the
    // container) makes pg emit 'error'. Without a listener, Node treats it as an
    // unhandled error, and Jest fails the suite even when every test passed. The
    // listener must exist before connect(), so it is attached right after construction.
    // It does not mask real query failures. Those reject their own client.query(...) call.
    client.on('error', () => {})
    await client.connect()
})

afterAll(async () => {
    await client.end()
})

describe('seed-pipeline catalog derivation on the real schema', () => {
    test('finds the composite keys declared out of primary-key order', async () => {
        const fks = await listForeignKeys(client)
        const names = misorderedCompositeFks(fks).map((f) => `${f.table}.${f.constraint}`).sort()
        expect(names).toEqual([
            'Highlight.Highlight_meetingId_cityId_fkey',
            'Notification.Notification_meetingId_cityId_fkey',
            'SpeakerSegment.SpeakerSegment_meetingId_cityId_fkey',
            'TaskStatus.TaskStatus_councilMeetingId_cityId_fkey',
        ])
        const segment = misorderedCompositeFks(fks).find((f) => f.table === 'SpeakerSegment')
        expect(segment?.parentPk).toEqual(['cityId', 'id'])
        expect(segment?.refColumns).toEqual(['id', 'cityId'])
    })

    test('finds the self-referencing keys on Subject and CouncilMeeting', async () => {
        const fks = await listForeignKeys(client)
        expect(selfReferencingFks(fks).map((f) => f.constraint).sort()).toEqual([
            'CouncilMeeting_cityId_continuationOfId_fkey',
            'CouncilMeeting_cityId_postponedFromId_fkey',
            'Subject_discussedInId_fkey',
        ])
    })

    test('lists the keys of an explicit-query table', async () => {
        const fks = await listForeignKeys(client)
        expect(fksOfTables(fks, ['DecisionCandidate']).map((f) => f.constraint)).toEqual(['DecisionCandidate_decisionId_fkey'])
    })

    test('checks whether a constraint exists in the public schema', async () => {
        expect(await constraintExists(client, 'Subject_discussedInId_fkey')).toBe(true)
        expect(await constraintExists(client, 'NotAConstraint_madeUp_fkey')).toBe(false)
    })

    test('does not see a constraint that lives outside the public schema', async () => {
        await client.query('CREATE SCHEMA seedreview_other')
        try {
            await client.query(`
                CREATE TABLE seedreview_other."Probe" (
                    id text PRIMARY KEY,
                    ref text,
                    CONSTRAINT "Probe_ref_fkey" FOREIGN KEY (ref) REFERENCES seedreview_other."Probe"(id)
                )
            `)
            expect(await constraintExists(client, 'Probe_ref_fkey')).toBe(false)
        } finally {
            await client.query('DROP SCHEMA seedreview_other CASCADE')
        }
    })

    test('counts rows and reads the migration head', async () => {
        const counts = await tableRowCounts(client, ['City', 'User'])
        expect(counts).toEqual({ City: expect.any(Number), User: expect.any(Number) })
        expect(await migrationHead(client)).toBeNull()
        expect(await listTables(client)).toEqual(expect.arrayContaining(['City', 'CouncilMeeting', '_prisma_migrations']))
    })

    test('reads the first primary-key column of each table', async () => {
        const columns = await primaryKeyColumns(client)
        expect(columns.City).toBe('id')
        expect(columns.CouncilMeeting).toBe('cityId')
    })

    test('finds no PGSync objects in a database without PGSync', async () => {
        expect(await listPgSyncObjects(client)).toEqual({ triggers: [], hasFunction: false, hasView: false })
    })
})
