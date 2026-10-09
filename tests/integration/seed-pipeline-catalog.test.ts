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
} from '@/lib/seed-pipeline/catalog'

let client: Client

beforeAll(async () => {
    const { databaseUrl } = await ensureTestDb()
    await ensureMigrationsTable(databaseUrl)
    client = new Client({ connectionString: databaseUrl })
    // tests/setup-integration.ts loads through setupFilesAfterEnv. Its afterAll therefore
    // registers before this file's own afterAll. Jest runs same-level afterAll hooks in
    // registration order. The shared container therefore stops first. This file's own
    // afterAll then calls client.end() on a server that is already stopped. A stray
    // disconnect notice can still reach the socket at that point. The listener must
    // already exist to catch it, so it is attached here, right after construction.
    // Without a listener, Node treats the notice as an unhandled error. Jest then fails
    // the suite, even though every test passed. The listener does not mask real query
    // failures. Those reject their own client.query(...) call directly.
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

    test('finds the self-referencing key on Subject', async () => {
        const fks = await listForeignKeys(client)
        expect(selfReferencingFks(fks).map((f) => f.constraint)).toEqual(['Subject_discussedInId_fkey'])
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
