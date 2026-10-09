import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { execFileSync, execSync } from 'child_process'
import { Client } from 'pg'
import prisma from '@/lib/db/prisma'
import { produce } from '@/lib/seed-pipeline/produce'
import { verify } from '@/lib/seed-pipeline/verify'
import { readManifest } from '@/lib/seed-pipeline/manifest'
import { binary } from '@/lib/seed-pipeline/process'
import { createSiblingDatabase, ensureMigrationsTable, ensureTestDb, resetDatabase } from '../helpers/test-db'
import { createAdministrativeBody, createCity, createMeeting, createNotificationPreference, createPerson, createSubject, createTaskStatus, createUser } from '../helpers/factories'

function onPath(tool: string): boolean {
    try {
        execSync(`command -v ${tool}`, { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

// pg_dump/pg_restore/psql are probed through `binary()` so the gate checks the same
// Postgres build the pipeline itself uses when `SEED_PG_BIN` points at a pinned one.
const tools = ['greenmask', 'zstd', 'gzip', binary('pg_dump'), binary('pg_restore'), binary('psql')]
const ready = tools.every(onPath)
// CI installs the tools (`.#seed-tools`), so a missing one there is a broken job, not a reason to skip.
if (!ready && process.env.CI) throw new Error(`the seed pipeline e2e test needs ${tools.filter((tool) => !onPath(tool)).join(', ')} on PATH`)
const maybe = ready ? describe : describe.skip

/** libpq refuses an unknown URI query parameter, and Prisma's `?schema=public` is one. */
function libpqUrl(url: string): string {
    const stripped = new URL(url)
    stripped.search = ''
    return stripped.toString()
}

/** PGSync's synced tables in this fixture. Production has 13; two show the mechanism. */
const PGSYNC_TABLES = ['City', 'CouncilMeeting']

const PGSYNC_CREATE = [
    'CREATE MATERIALIZED VIEW public._view AS SELECT 1 AS x',
    'CREATE FUNCTION public.table_notify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM 1 FROM public._view LIMIT 1; RETURN NULL; END $$',
    ...PGSYNC_TABLES.flatMap((table) => [
        `CREATE TRIGGER "public_${table}_notify" AFTER INSERT OR UPDATE OR DELETE ON public."${table}" FOR EACH ROW EXECUTE FUNCTION public.table_notify()`,
        `CREATE TRIGGER "public_${table}_truncate" AFTER TRUNCATE ON public."${table}" FOR EACH STATEMENT EXECUTE FUNCTION public.table_notify()`,
    ]),
]

const PGSYNC_DROP = [
    ...PGSYNC_TABLES.flatMap((table) => [`DROP TRIGGER "public_${table}_notify" ON public."${table}"`, `DROP TRIGGER "public_${table}_truncate" ON public."${table}"`]),
    'DROP FUNCTION public.table_notify()',
    'DROP MATERIALIZED VIEW public._view',
]

/**
 * A copy of prisma/ with one migration that production has not applied yet. It is
 * the SQL that Prisma writes for an `onDelete` change on `Subject.discussedIn`: it
 * drops the self-reference by name and adds it back. The rehearsal must apply it to
 * production's schema, before the normalisation drops that key for Greenmask.
 */
function schemaWithPendingMigration(root: string): string {
    const dir = path.join(root, 'prisma')
    fs.cpSync('prisma', dir, { recursive: true })
    const migration = path.join(dir, 'migrations', '29990101000000_pending_self_reference_change')
    fs.mkdirSync(migration)
    fs.writeFileSync(path.join(migration, 'migration.sql'), [
        'ALTER TABLE "Subject" DROP CONSTRAINT "Subject_discussedInId_fkey";',
        'ALTER TABLE "Subject" ADD CONSTRAINT "Subject_discussedInId_fkey" FOREIGN KEY ("discussedInId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
        '',
    ].join('\n'))
    return path.join(dir, 'schema.prisma')
}

/** Mark every migration of the repo as applied, as production has them. The rehearsal then applies only the pending one of `schemaWithPendingMigration`. */
async function markMigrationsApplied(databaseUrl: string): Promise<void> {
    await ensureMigrationsTable(databaseUrl)
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
        for (const name of fs.readdirSync('prisma/migrations').filter((d) => /^\d{14}_/.test(d)).sort()) {
            // Prisma's checksum is the sha256 of migration.sql. `migrate status` compares it.
            const checksum = crypto.createHash('sha256').update(fs.readFileSync(path.join('prisma/migrations', name, 'migration.sql'))).digest('hex')
            // The id is a random UUID, so it never collides with a pre-existing row and
            // `ON CONFLICT DO NOTHING` on the primary key would guard nothing. Replace
            // any existing row for this migration by name instead.
            await client.query('DELETE FROM _prisma_migrations WHERE migration_name = $1', [name])
            await client.query('INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)', [crypto.randomUUID(), checksum, name])
        }
    } finally {
        await client.end()
    }
}

type DumpMetadataEntry = { objectType: string; name: string; fileName: string }

/**
 * Reads every line of a table's data file in an unpacked artifact directory,
 * the way `privacy-scan.ts` locates a table through `metadata.json`.
 */
function readTableDataLines(dir: string, table: string): string[] {
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8')) as { entries: DumpMetadataEntry[] }
    const entries = metadata.entries.filter((e) => e.objectType === 'TABLE DATA' && e.name.replace(/^"|"$/g, '') === table)
    return entries.flatMap((e) => zlib.gunzipSync(fs.readFileSync(path.join(dir, e.fileName))).toString('utf8').split('\n'))
}

maybe('seed pipeline end to end', () => {
    // The describe body also runs when the suite is skipped, and a skipped suite
    // runs no afterAll. The directory is therefore made in beforeAll, not here.
    let root = ''
    let pollTaskId = ''

    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-seed-e2e-'))
        const sourceUrl = (await ensureTestDb()).databaseUrl
        await resetDatabase(prisma)
        await markMigrationsApplied(sourceUrl)

        const athens = await createCity({ id: 'athens', name: 'Αθήνα', status: 'supported' })
        await createCity({ id: 'pending-town', name: 'Pending', status: 'pending' })
        // Both cities carry a geometry, so the subset-only rule that nulls the
        // geometry of an unsupported city has something to remove.
        await prisma.$executeRawUnsafe(`UPDATE "City" SET geometry = ST_GeomFromText('POLYGON((23.7 37.9, 23.8 37.9, 23.8 38.0, 23.7 37.9))', 4326)`)
        const council = await createAdministrativeBody(athens.id, { id: 'athens-council', name: 'Council', contactEmails: ['dimos@athens.gr'] })
        const committee = await createAdministrativeBody(athens.id, { id: 'athens-committee', name: 'Committee', type: 'committee' })
        const subjectIds: string[] = []
        const segmentIds: string[] = []
        // A speaker identification follows its speaker tag. The tag of m1 is in the
        // subset. The tag of the unreleased m4 is not, so its identification is not either.
        const identified = await createPerson(athens.id, { name: 'Identified Person' })
        // m4 is the latest past-dated council meeting, and it is unreleased. Without
        // the `released` filter it would win council's window (meetingsPerBody=2)
        // over m1. The window therefore selects m1, m2, and the committee meeting m3.
        for (const [i, body] of [council, council, council, committee, council].entries()) {
            const m = await createMeeting(athens.id, { id: `m${i}`, name: `Meeting ${i}`, dateTime: new Date(2026, 0, i + 1), released: i !== 4, administrativeBodyId: body.id })
            const s = await createSubject(m.id, athens.id, { id: `s${i}`, name: `Subject ${i}` })
            const tag = await prisma.speakerTag.create({ data: { label: `Speaker ${i}` } })
            const seg = await prisma.speakerSegment.create({ data: { startTimestamp: 0, endTimestamp: 10, meetingId: m.id, cityId: athens.id, speakerTagId: tag.id } })
            if (i === 1 || i === 4) {
                // The kept meeting's evidence carries an email-like string, the same way
                // Utterance.text does, so the subset scan's publicText exemption for
                // SpeakerIdentification has something to cover.
                await prisma.speakerIdentification.create({ data: { speakerTagId: tag.id, method: 'transcript', personId: identified.id, actionable: true, evidenceKind: 'named', confidence: 90, evidence: `[00:01] The chair gives the floor to Identified Person (meeting ${i}), confirmed by dimos@athens.gr` } })
            }
            await prisma.utterance.create({ data: { text: `Utterance ${i} write to dimos@athens.gr`, startTimestamp: 0, endTimestamp: 5, speakerSegmentId: seg.id } })
            await createTaskStatus(m.id, athens.id, { type: 'summarize', status: 'completed', requestBody: JSON.stringify({ callbackUrl: 'https://x/cb?token=SECRET', mediaUrl: 'https://cdn/x.mp3' }), responseBody: '{"ok":true}' })
            subjectIds.push(s.id)
            segmentIds.push(seg.id)
        }
        // m5 is released, dated 2030, and has no subject and no segment. Production
        // holds such pre-published meetings. Without the date filter m5 would win
        // council's window, and `verify` would then report an empty meeting.
        await createMeeting(athens.id, { id: 'm5', name: 'Meeting 5', dateTime: new Date(2030, 0, 1), released: true, administrativeBodyId: council.id })
        // m6 is released and past-dated, and it has no subject and no segment.
        // Production holds released meetings that no one has transcribed yet. m6 is
        // the newest released council meeting, so without the content filter it would
        // take the first rank of council's window and push m1 out.
        await createMeeting(athens.id, { id: 'm6', name: 'Meeting 6', dateTime: new Date(2026, 0, 3, 12), released: true, administrativeBodyId: council.id })
        // A transcriptSent task stores the addresses the notification went to. They
        // are the addresses the AdministrativeBody rule removes, so a masking rule
        // removes this key too.
        await createTaskStatus('m1', athens.id, { type: 'transcriptSent', status: 'completed', requestBody: JSON.stringify({ recipientEmails: ['a@b.gr'] }) })
        // A voiceprint is a biometric identifier, so VoicePrint is a private table.
        // The generateVoiceprint task holds the same embedding in the "voiceprint" key
        // of its response, and a masking rule removes that key. The audio URL and the
        // duration stay. Both hang off m1, a meeting the subset keeps.
        const speaker = await createPerson(athens.id, { name: 'Voiced Person' })
        await prisma.voicePrint.create({ data: { embedding: '[0.1,0.2]', sourceAudioUrl: 'https://cdn/voice.mp3', startTimestamp: 0, endTimestamp: 10, personId: speaker.id, sourceSegmentId: segmentIds[1] } })
        await createTaskStatus('m1', athens.id, { type: 'generateVoiceprint', status: 'completed', requestBody: '{}', responseBody: JSON.stringify({ audioUrl: 'https://cdn/voice.mp3', voiceprint: '[0.1,0.2]', duration: 10 }) })
        // A transcribe request carries the voiceprints of the speakers, which are
        // biometric data, and a masking rule removes that key. The response holds
        // the whole transcript. The Utterance and Word tables hold the same words,
        // so a subset-only rule removes the utterances from the response. The full
        // artifact keeps the whole response.
        await createTaskStatus('m1', athens.id, {
            type: 'transcribe',
            status: 'completed',
            requestBody: JSON.stringify({ youtubeUrl: 'https://youtu.be/x', voiceprints: [{ personId: 'p', voiceprint: '[0.1]' }] }),
            responseBody: JSON.stringify({
                videoUrl: 'https://cdn/x.mp4',
                audioUrl: 'https://cdn/x.mp3',
                muxPlaybackId: 'mux-x',
                transcript: { transcription: { utterances: [{ text: 'Utterance 1', start: 0, end: 5, speaker: 0, drift: 0 }], speakers: [{ speaker: 0, match: null, confidence: {} }] } },
            }),
        })
        // One pollDecisions task on m1 creates the decisions of two meetings. In the
        // subset, d1 keeps the reference to this task, and d2, which sits on m2,
        // loses it. The full artifact holds every task, so d2 keeps it there.
        const pollTask = await createTaskStatus('m1', athens.id, { type: 'pollDecisions', status: 'completed', requestBody: '{}', responseBody: '{"decisions":[]}' })
        pollTaskId = pollTask.id

        const user = await createUser('person@test.local')
        // A highlight that a reader made is a private draft until it is showcased. One that
        // summarize made has no creator and stays as sample data. Each has a generateHighlight
        // task that names it in requestBody.parts[0].id.
        const m1Utterance = await prisma.utterance.findFirstOrThrow({ where: { speakerSegment: { meetingId: 'm1' } } })
        for (const [id, createdById, isShowcased] of [['h-reader', user.id, false], ['h-task', null, false], ['h-showcased', user.id, true]] as const) {
            await prisma.highlight.create({ data: { id, name: `Highlight ${id}`, meetingId: 'm1', cityId: athens.id, createdById, isShowcased, highlightedUtterances: { create: { utteranceId: m1Utterance.id } } } })
            if (id !== 'h-showcased') {
                await createTaskStatus('m1', athens.id, { type: 'generateHighlight', status: 'completed', requestBody: JSON.stringify({ parts: [{ id, utterances: [] }] }), responseBody: '{}' })
            }
        }
        // A decision candidate follows its meeting: the one on the unreleased m4 goes with it.
        for (const [id, councilMeetingId] of [['dc-kept', 'm1'], ['dc-unreleased', 'm4']]) {
            await prisma.decisionCandidate.create({ data: { id, cityId: athens.id, ada: `ADA-${id}`, pdfUrl: `https://x/${id}.pdf`, readStatus: 'ok', councilMeetingId } })
        }
        // A reader's notification address is a Location row that no subject uses. Only the
        // private preference links it, so it must not ship. A subject's location is public.
        await prisma.$executeRawUnsafe(`INSERT INTO "Location" (id, type, text, coordinates) VALUES
            ('loc-subject', 'point', 'Πλατεία Συντάγματος', ST_SetSRID(ST_MakePoint(23.73, 37.97), 4326)),
            ('loc-reader', 'point', 'Οδός Αναγνώστη 12', ST_SetSRID(ST_MakePoint(23.75, 37.98), 4326))`)
        await prisma.subject.update({ where: { id: 's1' }, data: { locationId: 'loc-subject' } })
        await createNotificationPreference({ userId: user.id, cityId: athens.id, locationIds: ['loc-reader'] })
        // d0 hangs off the unreleased meeting the subset drops, d1 off one it keeps.
        await prisma.decision.create({ data: { id: 'd0', subjectId: subjectIds[4], title: 'Dropped decision', pdfUrl: 'https://x/d0.pdf', createdById: user.id } })
        await prisma.decision.create({ data: { id: 'd1', subjectId: subjectIds[1], title: 'Kept decision', pdfUrl: 'https://x/d1.pdf', createdById: user.id, taskId: pollTask.id } })
        // d2 sits on m2, but its task sits on m1. A subset-only rule nulls that reference.
        await prisma.decision.create({ data: { id: 'd2', subjectId: subjectIds[2], title: 'Cross-meeting decision', pdfUrl: 'https://x/d2.pdf', taskId: pollTask.id } })
        // A consent period names the account that recorded it, so VoicePrintConsent
        // is a private table.
        await prisma.voicePrintConsent.create({ data: { personId: speaker.id, userId: user.id } })
        // Attendance events follow their meeting. ae-same keeps the task of its own
        // meeting. ae-cross sits on m2, but its task sits on m1, so a subset-only
        // rule nulls that reference. ae-null has no anchor subject and no task.
        // ae-dropped hangs off the unreleased meeting the subset drops.
        await prisma.attendanceEvent.create({ data: { id: 'ae-same', cityId: athens.id, councilMeetingId: 'm1', personId: speaker.id, kind: 'ARRIVAL', anchorKind: 'SUBJECT', anchorSubjectId: subjectIds[1], rawText: 'Arrived during subject 1', source: 'decision', taskId: pollTask.id } })
        await prisma.attendanceEvent.create({ data: { id: 'ae-cross', cityId: athens.id, councilMeetingId: 'm2', personId: speaker.id, kind: 'DEPARTURE', anchorKind: 'SUBJECT', anchorSubjectId: subjectIds[2], rawText: 'Left during subject 2', source: 'decision', taskId: pollTask.id } })
        await prisma.attendanceEvent.create({ data: { id: 'ae-null', cityId: athens.id, councilMeetingId: 'm2', personId: speaker.id, kind: 'DEPARTURE', anchorKind: 'SESSION_END', rawText: 'Left at the end', source: 'manual' } })
        await prisma.attendanceEvent.create({ data: { id: 'ae-dropped', cityId: athens.id, councilMeetingId: 'm4', personId: speaker.id, kind: 'ARRIVAL', anchorKind: 'SUBJECT', anchorSubjectId: subjectIds[4], rawText: 'Arrived during subject 4', source: 'decision' } })

        const dumpFile = path.join(root, 'backup.sql')
        // Production carries PGSync's change capture: a trigger function that reads
        // the materialized view _view, and triggers on the synced tables that call
        // it. As in production, _view is populated in the backup, so writes work in
        // scratch. A restored artifact holds _view without its rows, so writes fail
        // there. The triggers come after the rows, because the factories write through them.
        for (const statement of PGSYNC_CREATE) await prisma.$executeRawUnsafe(statement)
        execFileSync(binary('pg_dump'), ['--no-owner', '--no-privileges', '-d', libpqUrl(sourceUrl), '-f', dumpFile])
        execFileSync('gzip', ['-f', dumpFile])
        // Other suites write to the same source tables.
        for (const statement of PGSYNC_DROP) await prisma.$executeRawUnsafe(statement)
    }, 300_000)

    afterAll(() => {
        if (root) fs.rmSync(root, { recursive: true, force: true })
    })

    test('produce builds artifacts with private rows gone and expected counts, and verify accepts them', async () => {
        const scratchUrl = await createSiblingDatabase('seed_scratch')
        const outDir = path.join(root, 'out')
        const produceLog: string[] = []
        // m0 falls outside council's window. The pin brings it back into the subset.
        const pinsFile = path.join(root, 'pins.txt')
        fs.writeFileSync(pinsFile, 'athens/m0  # a pinned meeting the window drops\n')
        const schemaPath = schemaWithPendingMigration(root)
        const manifest = await produce({
            backupPath: path.join(root, 'backup.sql.gz'),
            outDir,
            workDir: path.join(root, 'work'),
            schemaPath,
            meetingsPerBody: 2,
            pinsFile,
            scratchUrl,
            log: (line) => produceLog.push(line),
        })
        // The rehearsal must run with PGSync's triggers, as production does, so the drop comes after it.
        const rehearsal = produceLog.findIndex((line) => line.includes('rehearsing prisma migrate deploy'))
        const pgSyncDrop = produceLog.findIndex((line) => line.includes('pgsync objects dropped'))
        expect(rehearsal).toBeGreaterThanOrEqual(0)
        expect(pgSyncDrop).toBeGreaterThan(rehearsal)
        // The normalisation is derived from the migrated catalog, so it comes after the rehearsal too.
        const normalisation = produceLog.findIndex((line) => line.includes('normalisation:'))
        expect(normalisation).toBeGreaterThan(rehearsal)
        // The pinned m0, the two latest council meetings, and the committee meeting.
        expect(manifest.meetings.map((m) => m.meetingId).sort()).toEqual(['m0', 'm1', 'm2', 'm3'])
        expect(manifest.meetings.find((m) => m.meetingId === 'm0')?.pinned).toBe(true)
        // m5 is released, but it is dated 2030 and holds no content, so the window skips it.
        expect(manifest.meetings.map((m) => m.meetingId)).not.toContain('m5')
        // m6 is released and past-dated, but it holds no content, so the window skips it too.
        expect(manifest.meetings.map((m) => m.meetingId)).not.toContain('m6')
        expect(manifest.meetings.every((m) => m.pinned === (m.meetingId === 'm0'))).toBe(true)
        expect(manifest.counts.SpeakerIdentification).toBe(1)
        expect(manifest.counts.User).toBe(0)
        expect(manifest.counts.NotificationPreference).toBe(0)
        expect(manifest.counts.Subject).toBe(4)
        expect(manifest.counts.TaskStatus).toBe(9)
        expect(manifest.counts.Highlight).toBe(2)
        expect(manifest.counts.DecisionCandidate).toBe(1)
        expect(manifest.counts.VoicePrint).toBe(0)
        expect(manifest.counts.City).toBe(2)
        expect(manifest.counts.Decision).toBe(2)
        expect(manifest.counts.AttendanceEvent).toBe(3)
        expect(manifest.counts.VoicePrintConsent).toBe(0)
        expect(fs.existsSync(path.join(outDir, 'subset.tar.zst'))).toBe(true)
        expect(fs.existsSync(path.join(outDir, 'full.tar.zst'))).toBe(true)
        // Greenmask's files of the run sit in their own directory under the work directory.
        expect(fs.readdirSync(path.join(root, 'work')).filter((name) => name.startsWith('run-'))).toHaveLength(1)
        // The archives are written under temporary names and renamed at the end, so none is left.
        expect(fs.readdirSync(outDir).sort()).toEqual(['full.tar.zst', 'manifest.json', 'subset.tar.zst'])

        const verifyUrls = { subset: await createSiblingDatabase('seed_verify_subset'), full: await createSiblingDatabase('seed_verify_full') }
        const report = await verify({ outDir, workDir: path.join(root, 'verify-work'), schemaPath, verifyUrls, log: () => undefined })
        expect(report.ok).toBe(true)
        expect(report.artifacts).toEqual({ producedAt: manifest.producedAt, subsetSha256: manifest.files.subset.sha256, fullSha256: manifest.files.full.sha256 })
        const scans = report.scans
        if (!scans) throw new Error('a passed verify report has scans')
        expect(scans.subset.perTable.Utterance.emails).toBe(4)
        // The kept meeting's SpeakerIdentification carries one email-like string.
        // publicText covers the table, so it counts here without becoming a violation.
        expect(scans.subset.perTable.SpeakerIdentification.emails).toBe(1)
        expect(scans.subset.violations).toEqual([])
        // Both artifacts drop the unreleased m4, so the full artifact holds the same 4
        // utterances with an email as the subset.
        expect(scans.full.perTable.Utterance.emails).toBe(4)
        expect(scans.full.violations).toEqual([])

        // The masking rule for the voiceprint embedding applies to both artifacts, so
        // the full artifact's TaskStatus rows never carry the embedding value either.
        // The subsetOnly rule for the transcribe response only applies to the subset,
        // so the full artifact keeps the whole transcribe response, utterances included.
        const fullTaskStatusLines = readTableDataLines(path.join(root, 'verify-work', 'full', 'artifact'), 'TaskStatus')
        expect(fullTaskStatusLines.some((line) => line.includes('[0.1,0.2]'))).toBe(false)
        expect(fullTaskStatusLines.some((line) => line.includes('"utterances":[{"text":"Utterance 1"'))).toBe(true)

        // verify restored the full artifact too. It keeps every meeting, the unreleased m4 included.
        const full = new Client({ connectionString: verifyUrls.full })
        await full.connect()
        try {
            const meetings = await full.query<{ id: string }>('SELECT id FROM "CouncilMeeting" ORDER BY id')
            // The unreleased m4 does not ship, and its rows go with it.
            expect(meetings.rows.map((r) => r.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm5', 'm6'])
            const highlights = await full.query<{ id: string }>('SELECT id FROM "Highlight" ORDER BY id')
            expect(highlights.rows.map((r) => r.id)).toEqual(['h-showcased', 'h-task'])
            const highlightTasks = await full.query<{ highlightId: string }>(`SELECT "requestBody"::jsonb #>> '{parts,0,id}' AS "highlightId" FROM "TaskStatus" WHERE type = 'generateHighlight'`)
            expect(highlightTasks.rows).toEqual([{ highlightId: 'h-task' }])
            // The foreign-key indexes that produce adds for the delete-when rules are gone again.
            const temporaryIndexes = await full.query<{ n: string }>("SELECT count(*)::text AS n FROM pg_indexes WHERE indexname LIKE 'seed_tmp_%'")
            expect(temporaryIndexes.rows[0].n).toBe('0')
            const candidates = await full.query<{ id: string }>('SELECT id FROM "DecisionCandidate" ORDER BY id')
            expect(candidates.rows).toEqual([{ id: 'dc-kept' }])
            // A segment points at its speaker tag, so m4's tag and the identification on it
            // outlive the meeting unless a rule removes the tags that no segment uses.
            const tags = await full.query<{ label: string }>('SELECT label FROM "SpeakerTag" ORDER BY label')
            expect(tags.rows.map((r) => r.label)).toEqual(['Speaker 0', 'Speaker 1', 'Speaker 2', 'Speaker 3'])
            const fullIdentifications = await full.query<{ evidence: string }>('SELECT evidence FROM "SpeakerIdentification"')
            expect(fullIdentifications.rows.map((r) => r.evidence)).toEqual(['[00:01] The chair gives the floor to Identified Person (meeting 1), confirmed by dimos@athens.gr'])
            // The full dump has no row filter, so the masking rule is what removes the reader's address.
            const locations = await full.query<{ id: string }>('SELECT id FROM "Location" ORDER BY id')
            expect(locations.rows).toEqual([{ id: 'loc-subject' }])
        } finally {
            await full.end()
        }

        const restored = new Client({ connectionString: verifyUrls.subset })
        await restored.connect()
        try {
            const bodies = await restored.query<{ contactEmails: string[] }>('SELECT "contactEmails" FROM "AdministrativeBody"')
            expect(bodies.rows).toHaveLength(2)
            expect(bodies.rows.every((r) => r.contactEmails.length === 0)).toBe(true)
            const tasks = await restored.query<{ type: string; requestBody: string; responseBody: string | null }>('SELECT type, "requestBody", "responseBody" FROM "TaskStatus"')
            expect(tasks.rows).toHaveLength(9)
            expect(tasks.rows.every((r) => !r.requestBody.includes('callbackUrl'))).toBe(true)
            expect(tasks.rows.every((r) => !r.requestBody.includes('recipientEmails'))).toBe(true)
            expect(tasks.rows.every((r) => !r.requestBody.includes('a@b.gr'))).toBe(true)
            expect(tasks.rows.every((r) => !r.requestBody.includes('voiceprints'))).toBe(true)
            // The voiceprint response loses the embedding only. The transcribe
            // response loses its utterances only. Every other task keeps the
            // response it had.
            const responseOf = (type: string): unknown[] => tasks.rows.filter((r) => r.type === type).map((r) => JSON.parse(r.responseBody ?? 'null'))
            expect(responseOf('generateVoiceprint')).toEqual([{ audioUrl: 'https://cdn/voice.mp3', duration: 10 }])
            expect(responseOf('transcribe')).toEqual([{
                videoUrl: 'https://cdn/x.mp4',
                audioUrl: 'https://cdn/x.mp3',
                muxPlaybackId: 'mux-x',
                transcript: { transcription: { speakers: [{ speaker: 0, match: null, confidence: {} }] } },
            }])
            expect(tasks.rows.filter((r) => r.type === 'summarize').map((r) => r.responseBody)).toEqual(['{"ok":true}', '{"ok":true}', '{"ok":true}', '{"ok":true}'])
            const voicePrintCount = await restored.query<{ n: string }>('SELECT count(*)::text AS n FROM "VoicePrint"')
            expect(voicePrintCount.rows[0].n).toBe('0')
            // The manifest counts above read `produce`'s own accounting; these read the
            // restored database directly, so a bug that under-reports a dropped table
            // would still be caught here.
            const userCount = await restored.query<{ n: string }>('SELECT count(*)::text AS n FROM "User"')
            expect(userCount.rows[0].n).toBe('0')
            const preferenceCount = await restored.query<{ n: string }>('SELECT count(*)::text AS n FROM "NotificationPreference"')
            expect(preferenceCount.rows[0].n).toBe('0')
            // produce drops PGSync's change capture, so the subset carries none of it.
            const pgSync = await restored.query<{ triggers: string; functions: string; views: string }>(`
                SELECT (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.proname = 'table_notify')::text AS triggers,
                       (SELECT count(*) FROM pg_proc WHERE proname = 'table_notify')::text AS functions,
                       (SELECT count(*) FROM pg_class WHERE relname = '_view')::text AS views`)
            expect(pgSync.rows).toEqual([{ triggers: '0', functions: '0', views: '0' }])
            const cities = await restored.query<{ id: string; hasGeometry: boolean }>('SELECT id, geometry IS NOT NULL AS "hasGeometry" FROM "City" ORDER BY id')
            expect(cities.rows).toEqual([{ id: 'athens', hasGeometry: true }, { id: 'pending-town', hasGeometry: false }])
            const decisions = await restored.query<{ id: string; createdById: string | null; taskId: string | null }>('SELECT id, "createdById", "taskId" FROM "Decision" ORDER BY id')
            // d0 hangs off the dropped meeting. d1's task sits on d1's own meeting, so
            // it keeps the reference; d2's task sits on another meeting, so it loses it.
            expect(decisions.rows).toEqual([
                { id: 'd1', createdById: null, taskId: pollTaskId },
                { id: 'd2', createdById: null, taskId: null },
            ])
            const events = await restored.query<{ id: string; anchorSubjectId: string | null; taskId: string | null }>('SELECT id, "anchorSubjectId", "taskId" FROM "AttendanceEvent" ORDER BY id')
            // ae-dropped hangs off the dropped meeting. ae-cross loses the task of
            // another meeting, ae-same keeps the task of its own meeting.
            expect(events.rows).toEqual([
                { id: 'ae-cross', anchorSubjectId: 's2', taskId: null },
                { id: 'ae-null', anchorSubjectId: null, taskId: null },
                { id: 'ae-same', anchorSubjectId: 's1', taskId: pollTaskId },
            ])
            const consentCount = await restored.query<{ n: string }>('SELECT count(*)::text AS n FROM "VoicePrintConsent"')
            expect(consentCount.rows[0].n).toBe('0')
            const selfRef = await restored.query<{ n: string }>("SELECT count(*)::text AS n FROM pg_constraint WHERE conname = 'Subject_discussedInId_fkey'")
            expect(selfRef.rows[0].n).toBe('1')
            // post-restore.sql re-adds the key as the pending migration left it, not as the backup had it.
            const selfRefDefinition = await restored.query<{ def: string }>("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'Subject_discussedInId_fkey'")
            expect(selfRefDefinition.rows[0].def).toContain('ON DELETE CASCADE')
            const identifications = await restored.query<{ evidence: string }>('SELECT evidence FROM "SpeakerIdentification"')
            expect(identifications.rows).toEqual([{ evidence: '[00:01] The chair gives the floor to Identified Person (meeting 1), confirmed by dimos@athens.gr' }])
        } finally {
            await restored.end()
        }
        expect(readManifest(outDir).files.subset.sha256).toHaveLength(64)
    }, 600_000)
})
