/** @jest-environment node */
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { DEFAULT_ARTIFACT_URL } from '@opencouncil/seed-pipeline/fetch';
import type { Manifest } from '@opencouncil/seed-pipeline/manifest';

/** Run the seed command as a contributor does. spawn, not spawnSync: the test's server must keep answering. */
function seed(args: string[], env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn(path.resolve('node_modules/.bin/tsx'), ['scripts/seed/cli.ts', ...args], { env: { ...process.env, ...env } });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
    });
}

describe('seed fetch', () => {
    const archive = Buffer.from('the subset archive');
    const sha256 = crypto.createHash('sha256').update(archive).digest('hex');
    const manifest: Manifest = {
        producedAt: '2026-10-22T00:00:00.000Z',
        backup: { path: 'production.sql.gz', date: '2026-10-22T01:00:00.000Z' },
        migrationHead: null,
        greenmaskVersion: 'test',
        meetingsPerBody: 2,
        cities: [],
        meetings: [],
        counts: {},
        files: { subset: { name: 'subset.tar.zst', sha256, bytes: archive.length }, full: { name: 'full.tar.zst', sha256, bytes: archive.length } },
    };
    let server: http.Server;
    let base = '';
    let root = '';

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            if (req.url === '/manifest.json') return res.end(JSON.stringify(manifest));
            if (req.url === '/subset.tar.zst') return res.end(archive);
            res.statusCode = 404;
            res.end();
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-seed-cli-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    // docs/database-seeding.md promises one cache for every clone and worktree.
    test('downloads into the user cache, not into the checkout', async () => {
        const { code, stdout, stderr } = await seed(['fetch', '--from', base], { XDG_CACHE_HOME: root });
        expect(stderr).not.toMatch(/Error/);
        expect(code).toBe(0);
        expect(stdout.trim()).toBe(path.join(root, 'opencouncil', 'seed-artifacts', sha256, 'subset.tar.zst'));
    }, 60_000);

    test('refuses --full against the public release, which holds the subset only', async () => {
        const { code, stdout, stderr } = await seed(['fetch', '--full'], { XDG_CACHE_HOME: root, SEED_ARTIFACT_URL: DEFAULT_ARTIFACT_URL });
        expect(code).toBe(1);
        expect(stdout).toBe('');
        expect(stderr).toMatch(/the public release holds the subset only: pass --from/);
        expect(fs.existsSync(path.join(root, 'opencouncil'))).toBe(false);
    }, 60_000);
});

// The .env of a checkout can name production. Every command that writes must stop before it connects.
describe('seed refuses a remote database', () => {
    const remote = 'postgresql://opencouncil@prod.example.invalid:5432/opencouncil';
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-seed-remote-'));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test.each(['setup', 'restore', 'reset', 'fixtures', 'status'])('%s', async (command) => {
        const env = { XDG_CACHE_HOME: root, SEED_ARTIFACT_URL: path.join(root, 'no-artifact'), DATABASE_URL: remote };
        const { code, stderr } = await seed([command, '--db', remote], env);
        expect(code).toBe(1);
        expect(stderr).toMatch(/"prod\.example\.invalid" is not a local host/);
        expect(fs.existsSync(path.join(root, 'opencouncil'))).toBe(false);
    }, 60_000);
});
