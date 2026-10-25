/** @jest-environment node */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertCheckoutHasMigrations, assertRestoreTools, checkedSnapshot } from './restore';
import { writeManifest, type Manifest } from './manifest';

function manifestWithHead(migrationHead: string | null): Manifest {
    const file = { name: 'subset.tar.zst', sha256: '0'.repeat(64), bytes: 1 };
    return {
        producedAt: '2026-10-20T00:00:00.000Z',
        backup: { path: 'production.sql.gz', date: '2026-10-20T01:00:00.000Z' },
        migrationHead,
        greenmaskVersion: 'test',
        meetingsPerBody: 2,
        cities: [],
        meetings: [],
        counts: {},
        files: { subset: file, full: { ...file, name: 'full.tar.zst' } },
    };
}

describe('assertCheckoutHasMigrations', () => {
    let root = '';
    let schemaPath = '';
    let tarPath = '';
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-restore-'));
        fs.mkdirSync(path.join(root, 'prisma', 'migrations', '20261015120000_known'), { recursive: true });
        schemaPath = path.join(root, 'prisma', 'schema.prisma');
        fs.mkdirSync(path.join(root, 'artifact'));
        tarPath = path.join(root, 'artifact', 'subset.tar.zst');
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('accepts an artifact whose newest migration the checkout has', () => {
        writeManifest(path.dirname(tarPath), manifestWithHead('20261015120000_known'));
        expect(() => assertCheckoutHasMigrations(tarPath, schemaPath)).not.toThrow();
    });

    test('refuses an artifact from a newer main, and says what to do', () => {
        writeManifest(path.dirname(tarPath), manifestWithHead('20261101120000_newer'));
        expect(() => assertCheckoutHasMigrations(tarPath, schemaPath)).toThrow(/20261101120000_newer.*Pull main/);
    });

    test('accepts an archive without a manifest beside it', () => {
        expect(() => assertCheckoutHasMigrations(tarPath, schemaPath)).not.toThrow();
    });
});

describe('checkedSnapshot', () => {
    let root = '';
    let source = '';
    // A new archive and manifest in the source directory, renamed over the old ones.
    function publish(body: string, recordedBody = body) {
        const sha256 = crypto.createHash('sha256').update(recordedBody).digest('hex');
        const manifest = manifestWithHead(null);
        writeManifest(source, { ...manifest, files: { ...manifest.files, subset: { name: 'subset.tar.zst', sha256, bytes: recordedBody.length } } });
        fs.writeFileSync(path.join(source, 'subset.tar.zst.tmp'), body);
        fs.renameSync(path.join(source, 'subset.tar.zst.tmp'), path.join(source, 'subset.tar.zst'));
    }
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-snapshot-'));
        source = path.join(root, 'out');
        fs.mkdirSync(source);
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('keeps the checked archive when the source is overwritten in place after the snapshot', async () => {
        publish('first run');
        const snapshot = await checkedSnapshot(path.join(source, 'subset.tar.zst'), path.join(root, 'work'));
        // The same file, written again: a hard link would show this content too.
        fs.writeFileSync(path.join(source, 'subset.tar.zst'), 'other bytes');
        expect(fs.readFileSync(snapshot, 'utf8')).toBe('first run');
    });

    test('keeps the checked archive when the source is replaced after the snapshot', async () => {
        publish('first run');
        const snapshot = await checkedSnapshot(path.join(source, 'subset.tar.zst'), path.join(root, 'work'));
        publish('second run');
        expect(fs.readFileSync(snapshot, 'utf8')).toBe('first run');
    });

    test('refuses an archive that does not match the manifest beside it', async () => {
        publish('an archive of another run', 'the recorded archive');
        await expect(checkedSnapshot(path.join(source, 'subset.tar.zst'), path.join(root, 'work'))).rejects.toThrow(/does not match/);
    });
});

describe('assertRestoreTools', () => {
    let bin = '';
    const saved = process.env.SEED_PG_BIN;
    // A stand-in for a client tool that prints the version line of a real one.
    const fakeTool = (name: string, version: string) => {
        fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "${name} (PostgreSQL) ${version}"\n`, { mode: 0o755 });
    };
    beforeEach(() => {
        bin = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-pg-bin-'));
        process.env.SEED_PG_BIN = bin;
    });
    afterEach(() => {
        if (saved === undefined) delete process.env.SEED_PG_BIN;
        else process.env.SEED_PG_BIN = saved;
        fs.rmSync(bin, { recursive: true, force: true });
    });

    test('names a client of another major version, and what to install', async () => {
        fakeTool('pg_restore', '18.6');
        fakeTool('psql', '16.15');
        await expect(assertRestoreTools()).rejects.toThrow(/needs the PostgreSQL 16 client tools, but pg_restore is version 18\.6\. Install them/);
    });

    test('names a client that is not installed', async () => {
        fakeTool('psql', '16.15');
        await expect(assertRestoreTools()).rejects.toThrow(/but pg_restore is not installed\./);
    });

    test('accepts the version 16 client tools', async () => {
        fakeTool('pg_restore', '16.15');
        fakeTool('psql', '16.9');
        await expect(assertRestoreTools()).resolves.toBeUndefined();
    });
});
