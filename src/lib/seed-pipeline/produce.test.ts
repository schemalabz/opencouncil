import fs from 'fs';
import os from 'os';
import path from 'path';
import { MANIFEST_FILE } from './manifest';
import { produce, PRODUCE_LOCK_FILE } from './produce';
import { VERIFY_REPORT_FILE } from './verify';

describe('produce', () => {
    let root = '';
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-produce-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('removes the manifest and the verify report of an earlier run before anything can fail', async () => {
        const outDir = path.join(root, 'out');
        fs.mkdirSync(outDir);
        fs.writeFileSync(path.join(outDir, MANIFEST_FILE), '{}');
        fs.writeFileSync(path.join(outDir, VERIFY_REPORT_FILE), '{"ok":true}');
        // The classification file does not exist, so produce fails before it starts a database.
        const run = produce({ backupPath: path.join(root, 'backup.sql.gz'), outDir, workDir: path.join(root, 'work'), schemaPath: 'prisma/schema.prisma', meetingsPerBody: 2, tablesFile: path.join(root, 'missing.json'), log: () => undefined });
        await expect(run).rejects.toThrow(/missing\.json/);
        expect(fs.existsSync(path.join(outDir, MANIFEST_FILE))).toBe(false);
        expect(fs.existsSync(path.join(outDir, VERIFY_REPORT_FILE))).toBe(false);
        // The run gives the output directory back when it fails.
        expect(fs.existsSync(path.join(outDir, PRODUCE_LOCK_FILE))).toBe(false);
    });

    const options = (outDir: string) => ({ backupPath: path.join(root, 'backup.sql.gz'), outDir, workDir: path.join(root, 'work'), schemaPath: 'prisma/schema.prisma', meetingsPerBody: 2, tablesFile: path.join(root, 'missing.json'), log: () => undefined });

    test('refuses an output directory that a running produce holds, and leaves its files alone', async () => {
        const outDir = path.join(root, 'out');
        fs.mkdirSync(outDir);
        fs.writeFileSync(path.join(outDir, MANIFEST_FILE), '{}');
        // This test process runs, so its pid stands for another produce run.
        fs.writeFileSync(path.join(outDir, PRODUCE_LOCK_FILE), String(process.pid));
        await expect(produce(options(outDir))).rejects.toThrow(`another produce run (pid ${process.pid}) writes to ${outDir}`);
        expect(fs.existsSync(path.join(outDir, MANIFEST_FILE))).toBe(true);
        expect(fs.readFileSync(path.join(outDir, PRODUCE_LOCK_FILE), 'utf8')).toBe(String(process.pid));
    });

    test('takes over a lock whose process no longer runs', async () => {
        const outDir = path.join(root, 'out');
        fs.mkdirSync(outDir);
        // pid_max on Linux is at most 4194304, so this pid cannot run.
        fs.writeFileSync(path.join(outDir, PRODUCE_LOCK_FILE), '9999999');
        // The run gets past the lock and fails later, on the missing classification file.
        await expect(produce(options(outDir))).rejects.toThrow(/missing\.json/);
        expect(fs.existsSync(path.join(outDir, PRODUCE_LOCK_FILE))).toBe(false);
    });
});
