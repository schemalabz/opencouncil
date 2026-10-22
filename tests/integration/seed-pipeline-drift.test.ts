import path from 'path'
import { Client } from 'pg'
import { createSiblingDatabase, ensureTestDb } from '../helpers/test-db'
import { prismaMigrate } from '@opencouncil/seed-pipeline/process'
import { schemaDrift } from '@opencouncil/seed-pipeline/verify'

const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')

async function sql(url: string, statement: string) {
    const client = new Client({ connectionString: url })
    client.on('error', () => {})
    await client.connect()
    try {
        await client.query(statement)
    } finally {
        await client.end()
    }
}

// A drift check that never reports drift passes every verify run, so this feeds it the
// drift that `produce` caused before post-restore.sql restored the column order.
describe('schemaDrift', () => {
    let url = ''

    beforeAll(async () => {
        await ensureTestDb()
        url = await createSiblingDatabase('seed_drift')
        await sql(url, 'CREATE EXTENSION IF NOT EXISTS postgis')
        await prismaMigrate(url, schemaPath, ['deploy'])
    }, 300_000)

    test('finds no drift in a database that the migrations built', async () => {
        expect(await schemaDrift(url, schemaPath)).toBeNull()
    }, 300_000)

    test('names a composite key declared in another column order', async () => {
        await sql(url, `ALTER TABLE "SpeakerSegment" DROP CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey";
            ALTER TABLE "SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey" FOREIGN KEY ("cityId", "meetingId") REFERENCES "CouncilMeeting"("cityId", id) ON UPDATE CASCADE ON DELETE CASCADE;`)
        expect(await schemaDrift(url, schemaPath)).toMatch(/SpeakerSegment/)
    }, 300_000)
})
