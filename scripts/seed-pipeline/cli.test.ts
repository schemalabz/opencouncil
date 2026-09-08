import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sha256File } from '@/lib/seed-pipeline/artifact';
import { Manifest, writeManifest } from '@/lib/seed-pipeline/manifest';

/** Run the CLI as a user does. Every case here stops before it starts Postgres or reads a database. */
function cli(args: string[]): { status: number | null; stderr: string } {
    const result = spawnSync(path.resolve('node_modules/.bin/tsx'), ['scripts/seed-pipeline/cli.ts', ...args], { encoding: 'utf8' });
    return { status: result.status, stderr: result.stderr };
}

describe('seed-pipeline CLI', () => {
    let root = '';
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-cli-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test.each(['0', '-3', 'abc', '1.5'])('produce refuses --n %s', (n) => {
        const { status, stderr } = cli(['produce', '--backup', path.join(root, 'b.sql.gz'), '--out', path.join(root, 'out'), '--n', n]);
        expect(status).toBe(1);
        expect(stderr).toMatch(/--n must be a positive integer/);
    }, 30_000);

    test('restore refuses a remote database', () => {
        const { status, stderr } = cli(['restore', '--from', path.join(root, 'subset.tar.zst'), '--into', 'postgresql://u@db.example.com/db']);
        expect(status).toBe(1);
        expect(stderr).toMatch(/not a local host/);
    }, 30_000);

    test('restore refuses an archive that the manifest next to it does not record', async () => {
        const archive = path.join(root, 'subset.tar.zst');
        fs.writeFileSync(archive, 'the subset of another run');
        const manifest: Manifest = {
            producedAt: '2026-10-09T00:00:00.000Z',
            backup: { path: 'production.sql.gz', date: '2026-10-09T00:00:00.000Z' },
            migrationHead: null,
            greenmaskVersion: 'test',
            meetingsPerBody: 2,
            cities: [],
            meetings: [],
            counts: {},
            files: {
                subset: { name: 'subset.tar.zst', sha256: '0'.repeat(64), bytes: 1 },
                full: { name: 'full.tar.zst', sha256: '0'.repeat(64), bytes: 1 },
            },
        };
        writeManifest(root, manifest);
        const { status, stderr } = cli(['restore', '--from', archive, '--into', 'postgresql://u@localhost:5432/db']);
        expect(status).toBe(1);
        expect(stderr).toMatch(/does not match manifest\.json/);
        expect(stderr).toContain(await sha256File(archive));
    }, 30_000);
});
