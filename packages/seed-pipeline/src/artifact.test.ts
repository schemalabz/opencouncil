import fs from 'fs';
import os from 'os';
import path from 'path';
import { newestDumpDir, packArtifact, sha256File, unpackArtifact } from './artifact';

describe('artifact packing', () => {
    let root: string;

    afterEach(() => {
        if (root) fs.rmSync(root, { recursive: true, force: true });
    });

    test('packs a dump directory with post-restore.sql and unpacks it back', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-artifact-'));
        const dumpDir = path.join(root, 'storage', '1788810579823');
        fs.mkdirSync(dumpDir, { recursive: true });
        fs.writeFileSync(path.join(dumpDir, 'toc.dat'), 'toc');
        fs.writeFileSync(path.join(dumpDir, '5077.dat.gz'), 'data');
        const outFile = path.join(root, 'subset.tar.zst');

        const packed = await packArtifact({ dumpDir, postRestoreSql: ['ALTER TABLE x ADD CONSTRAINT y FOREIGN KEY (a) REFERENCES z(id);'], outFile });
        expect(packed.bytes).toBeGreaterThan(0);
        expect(packed.sha256).toBe(await sha256File(outFile));

        const target = path.join(root, 'unpacked');
        const dir = await unpackArtifact(outFile, target);
        expect(fs.readFileSync(path.join(dir, 'toc.dat'), 'utf8')).toBe('toc');
        expect(fs.readFileSync(path.join(dir, 'post-restore.sql'), 'utf8')).toContain('ADD CONSTRAINT y');
    });

    test('newestDumpDir picks the highest numeric directory', () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-storage-'));
        for (const name of ['1788810000000', '1788810579823', 'heartbeat']) fs.mkdirSync(path.join(root, name));
        expect(newestDumpDir(root)).toBe(path.join(root, '1788810579823'));
    });

    test('unpackArtifact clears a non-empty target before unpacking', async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-artifact-'));
        const dumpDir = path.join(root, 'storage', '1788810579823');
        fs.mkdirSync(dumpDir, { recursive: true });
        fs.writeFileSync(path.join(dumpDir, 'toc.dat'), 'toc');
        const outFile = path.join(root, 'subset.tar.zst');
        await packArtifact({ dumpDir, postRestoreSql: [], outFile });

        const target = path.join(root, 'unpacked');
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(target, 'stale-from-a-previous-restore.dat'), 'stale');

        const dir = await unpackArtifact(outFile, target);
        expect(fs.existsSync(path.join(dir, 'stale-from-a-previous-restore.dat'))).toBe(false);
        expect(fs.readFileSync(path.join(dir, 'toc.dat'), 'utf8')).toBe('toc');
    });
});
