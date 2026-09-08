import fs from 'fs';
import os from 'os';
import path from 'path';
import { withClient } from './catalog';
import { pinProblems } from './expected-counts';
import { contentTables, loadTablesConfig, EXPECTED_COUNTS_SQL } from './tables';
import { startTransientPostgres } from './transient-postgres';

describe('expected-counts.sql', () => {
    test('counts every content table of the main schema, and no other table', () => {
        const sql = fs.readFileSync(EXPECTED_COUNTS_SQL, 'utf8');
        const values = sql.slice(sql.indexOf('FROM (VALUES'));
        const counted = [...values.matchAll(/^\s*\('(\w+)',/gm)].map((m) => m[1]);
        expect(counted.filter((t, i) => counted.indexOf(t) !== i)).toEqual([]);
        expect([...counted].sort()).toEqual([...contentTables(loadTablesConfig())].sort());
    });
});

// The cluster needs the flake's Postgres. See transient-postgres.test.ts for the command.
function hasSeedPgBin(): boolean {
    const bin = process.env.SEED_PG_BIN;
    return bin !== undefined && fs.existsSync(path.join(bin, 'initdb'));
}

const maybe = hasSeedPgBin() ? describe : describe.skip;

maybe('pinProblems', () => {
    test('names a pin without a meeting, without a subject, or without a speaker segment', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-pins-'));
        const pg = await startTransientPostgres({ dir, log: () => undefined });
        try {
            await pg.createDatabase('pins');
            await withClient(pg.url('pins'), async (client) => {
                await client.query(`
                    CREATE TABLE "CouncilMeeting" ("cityId" text, id text);
                    CREATE TABLE "Subject" ("cityId" text, "councilMeetingId" text);
                    CREATE TABLE "SpeakerSegment" ("cityId" text, "meetingId" text);
                    INSERT INTO "CouncilMeeting" VALUES ('athens', 'full'), ('athens', 'no-subject'), ('athens', 'empty');
                    INSERT INTO "Subject" VALUES ('athens', 'full'), ('athens', 'empty-elsewhere');
                    INSERT INTO "SpeakerSegment" VALUES ('athens', 'full'), ('athens', 'no-subject');`);
                const pin = (meetingId: string) => ({ cityId: 'athens', meetingId, reason: '' });
                expect(await pinProblems(client, [])).toEqual([]);
                expect(await pinProblems(client, [pin('full'), pin('no-subject'), pin('empty'), pin('missing')])).toEqual([
                    'athens/no-subject: no subject',
                    'athens/empty: no subject and no speaker segment',
                    'athens/missing: no such meeting',
                ]);
            });
        } finally {
            await pg.stop();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, 120_000);
});
