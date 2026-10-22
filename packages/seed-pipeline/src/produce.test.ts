import fs from 'fs';
import os from 'os';
import path from 'path';
import { MANIFEST_FILE } from './manifest';
import { produce, publishRun } from './produce';

describe('produce', () => {
    let root = '';
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-produce-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    const options = (outDir: string) => ({ backupPath: path.join(root, 'backup.sql.gz'), outDir, workDir: path.join(root, 'work'), schemaPath: 'prisma/schema.prisma', meetingsPerBody: 2, tablesFile: path.join(root, 'missing.json'), log: () => undefined });

    test('a failed run removes its staging directory, and leaves the runs already in the output directory alone', async () => {
        const outDir = path.join(root, 'out');
        fs.mkdirSync(path.join(outDir, 'seed-20261021T010000Z-AbC123'), { recursive: true });
        fs.writeFileSync(path.join(outDir, 'seed-20261021T010000Z-AbC123', MANIFEST_FILE), 'earlier run');
        // The classification file does not exist, so produce fails before it starts a database.
        await expect(produce(options(outDir))).rejects.toThrow(/missing\.json/);
        expect(fs.readdirSync(outDir)).toEqual(['seed-20261021T010000Z-AbC123']);
        expect(fs.readFileSync(path.join(outDir, 'seed-20261021T010000Z-AbC123', MANIFEST_FILE), 'utf8')).toBe('earlier run');
    });

    describe('publishRun', () => {
        const staging = (outDir: string, name: string) => {
            fs.mkdirSync(outDir, { recursive: true });
            const dir = fs.mkdtempSync(path.join(outDir, '.staging-'));
            fs.writeFileSync(path.join(dir, MANIFEST_FILE), name);
            return dir;
        };

        test('names the run by its start time and the suffix of its staging directory', () => {
            const dir = staging(path.join(root, 'out'), 'first');
            const published = publishRun(dir, new Date('2026-10-22T10:15:00.123Z'));
            expect(published).toBe(path.join(root, 'out', `seed-20261022T101500Z-${path.basename(dir).slice('.staging-'.length)}`));
            expect(fs.readFileSync(path.join(published, MANIFEST_FILE), 'utf8')).toBe('first');
            expect(fs.statSync(published).mode & 0o777).toBe(0o755);
            expect(fs.existsSync(dir)).toBe(false);
        });

        test('two runs that finish at the same time publish two directories', () => {
            const outDir = path.join(root, 'out');
            const first = staging(outDir, 'first');
            const second = staging(outDir, 'second');
            const at = new Date('2026-10-22T10:15:00Z');
            const published = [publishRun(first, at), publishRun(second, at)];
            expect(published.map((dir) => fs.readFileSync(path.join(dir, MANIFEST_FILE), 'utf8'))).toEqual(['first', 'second']);
        });

        test('never takes the name of a directory that exists, even an empty one', () => {
            const dir = staging(path.join(root, 'out'), 'new');
            const at = new Date('2026-10-22T10:15:00Z');
            const taken = path.join(root, 'out', `seed-20261022T101500Z-${path.basename(dir).slice('.staging-'.length)}`);
            fs.mkdirSync(taken);
            expect(() => publishRun(dir, at)).toThrow(`${taken} exists already`);
            expect(fs.readdirSync(taken)).toEqual([]);
        });
    });
});
