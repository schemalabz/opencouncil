import fs from 'fs';
import os from 'os';
import path from 'path';
import { sha256File } from './artifact';
import { Manifest, writeManifest } from './manifest';
import { noOpUpdateSql, verify, VERIFY_REPORT_FILE, VerifyReport } from './verify';

describe('verify report', () => {
    let root = '';
    let outDir = '';
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-verify-'));
        outDir = path.join(root, 'out');
        fs.mkdirSync(outDir);
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });
    const reportFile = () => path.join(outDir, VERIFY_REPORT_FILE);
    const readReport = () => JSON.parse(fs.readFileSync(reportFile(), 'utf8')) as VerifyReport;

    test('removes the report of an earlier run before anything can fail', async () => {
        fs.writeFileSync(reportFile(), JSON.stringify({ ok: true }));
        // No manifest.json, so verify fails at once.
        await expect(verify({ outDir, workDir: path.join(root, 'work'), schemaPath: 'prisma/schema.prisma', log: () => undefined })).rejects.toThrow(/manifest\.json/);
        expect(fs.existsSync(reportFile())).toBe(false);
    });

    test('writes a failed report with the thrown error when a step after the file checks throws', async () => {
        // The files match the manifest, but they are not zstd archives, so the restore throws.
        const files: Manifest['files'] = { subset: { name: 'subset.tar.zst', sha256: '', bytes: 0 }, full: { name: 'full.tar.zst', sha256: '', bytes: 0 } };
        for (const info of [files.subset, files.full]) {
            const file = path.join(outDir, info.name);
            fs.writeFileSync(file, `not an archive: ${info.name}`);
            info.sha256 = await sha256File(file);
            info.bytes = fs.statSync(file).size;
        }
        const manifest: Manifest = {
            producedAt: '2026-10-03T00:00:00.000Z',
            backup: { path: 'production.sql.gz', date: '2026-10-02T00:00:00.000Z' },
            migrationHead: null,
            greenmaskVersion: 'test',
            meetingsPerBody: 2,
            cities: [],
            meetings: [],
            counts: {},
            files,
        };
        writeManifest(outDir, manifest);
        const failure = verify({ outDir, workDir: path.join(root, 'work'), schemaPath: 'prisma/schema.prisma', verifyUrls: { subset: 'postgresql://seed@localhost:1/verify_subset', full: 'postgresql://seed@localhost:1/verify_full' }, log: () => undefined });
        await expect(failure).rejects.toThrow(/tar/);
        const report = readReport();
        expect(report.ok).toBe(false);
        expect(report.artifacts).toEqual({ producedAt: manifest.producedAt, subsetSha256: files.subset.sha256, fullSha256: files.full.sha256 });
        expect(report.failures).toHaveLength(1);
        expect(report.failures[0]).toMatch(/tar/);
        expect(report.scans).toBeUndefined();
    });
});

describe('noOpUpdateSql', () => {
    test('sets the primary-key column to itself on one row, with quoted identifiers', () => {
        expect(noOpUpdateSql('Odd"Name', 'id')).toBe(
            'UPDATE public."Odd""Name" SET "id" = "id" WHERE ctid = (SELECT ctid FROM public."Odd""Name" LIMIT 1)',
        );
    });
});
