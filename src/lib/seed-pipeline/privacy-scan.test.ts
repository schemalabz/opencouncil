import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { scanDumpDir } from './privacy-scan';

function writeDump(root: string, tables: Record<string, string[]>): void {
    const entries = Object.entries(tables).map(([table, rows], i) => {
        const fileName = `${5000 + i}.dat.gz`;
        fs.writeFileSync(path.join(root, fileName), zlib.gzipSync(rows.join('\n') + '\n'));
        return { dumpId: 5000 + i, objectType: 'TABLE DATA', schema: '"public"', name: `"${table}"`, fileName };
    });
    fs.writeFileSync(path.join(root, 'metadata.json'), JSON.stringify({ entries }));
}

describe('scanDumpDir', () => {
    let root: string;

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('counts email-like and phone-like strings per table and flags tables outside publicText', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-scan-'));
        writeDump(root, {
            Utterance: ['u1\tστείλτε στο dimos@example.gr', 'u2\tκαλέστε 6912345678'],
            AdministrativeBody: ['b1\t{}', 'b2\t{contact@city.gr}'],
            City: ['athens\tΑθήνα'],
        });
        const report = await scanDumpDir(root, new Set(['Utterance']));
        expect(report.perTable).toEqual({
            Utterance: { emails: 1, phones: 1, callbackTokens: 0 },
            AdministrativeBody: { emails: 1, phones: 0, callbackTokens: 0 },
            City: { emails: 0, phones: 0, callbackTokens: 0 },
        });
        expect(report.violations).toEqual(['AdministrativeBody']);
    });

    test('does not count a number inside a larger token as a phone, but counts a prefixed number', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-scan-'));
        writeDump(root, {
            VoicePrint: ['v1\t0.6912345678 23.6912345678'],
            // The last column is a PostGIS hex geometry. It holds ten digits after a
            // hex letter, which a lookbehind that excludes only a digit or a dot reads
            // as a phone number.
            Location: ['l1\tpoint\tΦ. Νέγρη 43\t0101000020E610000033BA281F27BD3740AB97DF6932004340'],
            Utterance: ['u3\t+30 6912345678'],
        });
        const report = await scanDumpDir(root, new Set(['Utterance']));
        expect(report.perTable.VoicePrint.phones).toBe(0);
        expect(report.perTable.Location.phones).toBe(0);
        expect(report.perTable.Utterance.phones).toBe(1);
        expect(report.violations).toEqual([]);
    });

    test.each([
        ['a number at the start of a line of a multi-line value', 'p1\tΓραφείο\\n6912345678'],
        ['a number after an abbreviation with a dot', 'p1\tτηλ.6912345678'],
        ['a number with spaces', 'p1\t694 123 4567'],
        ['a +30 number without a space', 'p1\t+306912345678'],
        ['a landline', 'p1\t2101234567'],
    ])('counts %s as a phone, and flags the table', async (_case, row) => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-scan-'));
        writeDump(root, { Person: [row] });
        const report = await scanDumpDir(root, new Set());
        expect(report.perTable.Person).toEqual({ emails: 0, phones: 1, callbackTokens: 0 });
        expect(report.violations).toEqual(['Person']);
    });

    test('does not count a timestamp or a migration name as a phone', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-scan-'));
        writeDump(root, { CouncilMeeting: ['m1\t2026-10-09 12:34:56.789\t2026-10-09 12:34:56+03'], _prisma_migrations: ['x\t20261002120000_add_speaker_identifications'] });
        const report = await scanDumpDir(root, new Set());
        expect(report.violations).toEqual([]);
    });

    test('flags a callback URL with its token in any table, public text included', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-scan-'));
        const token = 'ab'.repeat(32);
        writeDump(root, {
            TaskStatus: [`t1\t{"error":"POST https://opencouncil.gr/api/cities/athens/meetings/m1/taskStatuses/t1?token=${token} timed out"}`],
            Utterance: ['u1\ta municipal page ?searchProfileId=2255&user=&token=&uuid=72a546'],
        });
        const report = await scanDumpDir(root, new Set(['TaskStatus', 'Utterance']));
        expect(report.perTable.TaskStatus.callbackTokens).toBe(1);
        expect(report.perTable.Utterance.callbackTokens).toBe(0);
        expect(report.violations).toEqual(['TaskStatus']);
    });

    test('scans a very long geometry hex line with no match', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-scan-'));
        // A pending city holds a polygon of this size. The email regex backtracks
        // quadratically over a long alphanumeric run, so an unguarded scan of this
        // line runs for minutes.
        const hex = '0101000020E6100000'.repeat(20_000).slice(0, 300_000);
        expect(hex).toHaveLength(300_000);
        expect(hex).not.toContain('@');
        writeDump(root, { City: [`athens\tΑθήνα\t${hex}`] });
        const report = await scanDumpDir(root, new Set());
        expect(report.perTable.City).toEqual({ emails: 0, phones: 0, callbackTokens: 0 });
        expect(report.violations).toEqual([]);
    });

    test('rejects when metadata.json names a file that does not exist', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-scan-'));
        fs.writeFileSync(
            path.join(root, 'metadata.json'),
            JSON.stringify({
                entries: [{ dumpId: 1, objectType: 'TABLE DATA', schema: '"public"', name: '"Utterance"', fileName: 'does-not-exist.dat.gz' }],
            }),
        );
        const failure = scanDumpDir(root, new Set(['Utterance']));
        await expect(failure).rejects.toThrow(/does-not-exist|ENOENT/);
        await expect(failure).rejects.toMatchObject({ cause: { code: 'ENOENT' } });
    });

    test('rejects when a data file is not valid gzip', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-scan-'));
        fs.writeFileSync(
            path.join(root, 'metadata.json'),
            JSON.stringify({
                entries: [{ dumpId: 1, objectType: 'TABLE DATA', schema: '"public"', name: '"Utterance"', fileName: 'corrupt.dat.gz' }],
            }),
        );
        fs.writeFileSync(path.join(root, 'corrupt.dat.gz'), 'this is not gzip data');
        await expect(scanDumpDir(root, new Set(['Utterance']))).rejects.toThrow();
    });
});
