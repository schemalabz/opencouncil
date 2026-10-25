/** @jest-environment node */
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import net, { type AddressInfo } from 'net';
import os from 'os';
import path from 'path';
import { ArtifactUnavailableError, fetchArtifact } from './fetch';
import type { Manifest } from './manifest';

const archive = Buffer.from('the subset archive');

function manifestFor(body: Buffer, recordedSha?: string): Manifest {
    const sha256 = recordedSha ?? crypto.createHash('sha256').update(body).digest('hex');
    return {
        producedAt: '2026-10-20T00:00:00.000Z',
        backup: { path: 'production.sql.gz', date: '2026-10-20T01:00:00.000Z' },
        migrationHead: null,
        greenmaskVersion: 'test',
        meetingsPerBody: 2,
        cities: [],
        meetings: [],
        counts: {},
        files: {
            subset: { name: 'subset.tar.zst', sha256, bytes: body.length },
            full: { name: 'full.tar.zst', sha256, bytes: body.length },
        },
    };
}

describe('fetchArtifact', () => {
    let root = '';
    let server: http.Server;
    let base = '';
    let manifest: Manifest = manifestFor(archive);
    let archiveRequests = 0;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            if (req.url === '/release/manifest.json') return res.end(JSON.stringify(manifest));
            if (req.url === '/release/subset.tar.zst') {
                archiveRequests++;
                return res.end(archive);
            }
            res.statusCode = 404;
            res.end();
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/release`;
    });
    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
    });
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-fetch-'));
        manifest = manifestFor(archive);
        archiveRequests = 0;
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    // fetch() stopped the process on a response like this: HTTP/1.0, then the server
    // closes the connection while the download waits for the disk. Python's
    // http.server answers this way.
    test('follows redirects to a server that closes the connection after each response', async () => {
        const large = crypto.randomBytes(32 * 1024 * 1024);
        const largeManifest = manifestFor(large);
        const closing = net.createServer((socket) => {
            socket.once('data', (request) => {
                const target = request.toString().split(' ')[1];
                const reply = (head: string, body: Buffer = Buffer.alloc(0)) => {
                    socket.write(`HTTP/1.0 ${head}\r\nContent-Length: ${body.length}\r\n\r\n`);
                    socket.end(body);
                };
                if (target === '/moved/manifest.json') return reply('302 Found\r\nLocation: /real/manifest.json');
                if (target === '/moved/subset.tar.zst') return reply('302 Found\r\nLocation: /real/subset.tar.zst');
                if (target === '/real/manifest.json') return reply('200 OK', Buffer.from(JSON.stringify(largeManifest)));
                if (target === '/real/subset.tar.zst') return reply('200 OK', large);
                reply('404 Not Found');
            });
        });
        await new Promise<void>((resolve) => closing.listen(0, '127.0.0.1', resolve));
        try {
            const port = (closing.address() as AddressInfo).port;
            const tarPath = await fetchArtifact({ from: `http://127.0.0.1:${port}/moved`, kind: 'subset', cacheDir: root });
            expect(path.basename(path.dirname(tarPath))).toBe(largeManifest.files.subset.sha256);
        } finally {
            await new Promise((resolve) => closing.close(resolve));
        }
    }, 30_000);

    test('two first runs that download at the same time both succeed', async () => {
        // The server answers both archive requests only once both have arrived, so
        // the two downloads overlap, as two first runs in two checkouts can.
        const waiting: http.ServerResponse[] = [];
        const both = http.createServer((req, res) => {
            if (req.url === '/release/manifest.json') return res.end(JSON.stringify(manifest));
            waiting.push(res);
            if (waiting.length === 2) for (const r of waiting) r.end(archive);
        });
        await new Promise<void>((resolve) => both.listen(0, '127.0.0.1', resolve));
        try {
            const from = `http://127.0.0.1:${(both.address() as AddressInfo).port}/release`;
            const runs = await Promise.all([fetchArtifact({ from, kind: 'subset', cacheDir: root }), fetchArtifact({ from, kind: 'subset', cacheDir: root })]);
            expect(runs[0]).toBe(runs[1]);
            expect(fs.readFileSync(runs[0])).toEqual(archive);
            expect(fs.readdirSync(path.dirname(runs[0])).sort()).toEqual(['manifest.json', 'subset.tar.zst']);
        } finally {
            await new Promise((resolve) => both.close(resolve));
        }
    });

    test('removes a temporary file that a stopped download left, and keeps one that a running download may own', async () => {
        const dir = path.join(root, manifest.files.subset.sha256);
        fs.mkdirSync(dir, { recursive: true });
        const stale = path.join(dir, 'subset.tar.zst.1-aaaaaaaa.partial');
        const fresh = path.join(dir, 'subset.tar.zst.2-bbbbbbbb.partial');
        fs.writeFileSync(stale, 'stopped');
        fs.writeFileSync(fresh, 'still running');
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
        fs.utimesSync(stale, twoDaysAgo, twoDaysAgo);
        await fetchArtifact({ from: base, kind: 'subset', cacheDir: root });
        expect(fs.readdirSync(dir).sort()).toEqual(['manifest.json', 'subset.tar.zst', 'subset.tar.zst.2-bbbbbbbb.partial']);
    });

    test('stops after too many redirects', async () => {
        const loop = http.createServer((req, res) => res.writeHead(302, { Location: req.url }).end());
        await new Promise<void>((resolve) => loop.listen(0, '127.0.0.1', resolve));
        try {
            const port = (loop.address() as AddressInfo).port;
            await expect(fetchArtifact({ from: `http://127.0.0.1:${port}`, kind: 'subset', cacheDir: root })).rejects.toThrow(/more than 5 redirects/);
        } finally {
            await new Promise((resolve) => loop.close(resolve));
        }
    });

    test('downloads the archive beside its manifest, and a second fetch reads it from the cache', async () => {
        const cacheDir = path.join(root, 'cache');
        const first = await fetchArtifact({ from: `${base}/`, kind: 'subset', cacheDir });
        expect(first).toBe(path.join(cacheDir, manifest.files.subset.sha256, 'subset.tar.zst'));
        expect(fs.readFileSync(first)).toEqual(archive);
        expect(fs.existsSync(path.join(path.dirname(first), 'manifest.json'))).toBe(true);
        expect(await fetchArtifact({ from: base, kind: 'subset', cacheDir })).toBe(first);
        expect(archiveRequests).toBe(1);
    });

    test('refuses an archive that does not match the manifest, and leaves no file behind', async () => {
        manifest = manifestFor(archive, '0'.repeat(64));
        const cacheDir = path.join(root, 'cache');
        await expect(fetchArtifact({ from: base, kind: 'subset', cacheDir })).rejects.toThrow(/does not match/);
        expect(fs.readdirSync(path.join(cacheDir, '0'.repeat(64)))).toEqual(['manifest.json']);
    });

    test('reports a source it cannot read as unavailable', async () => {
        await expect(fetchArtifact({ from: `${base}/missing`, kind: 'subset', cacheDir: root })).rejects.toThrow(ArtifactUnavailableError);
        await expect(fetchArtifact({ from: 'http://127.0.0.1:1', kind: 'subset', cacheDir: root })).rejects.toThrow(ArtifactUnavailableError);
    });

    test('returns a local archive, or the archive of a local directory, as it is', async () => {
        const file = path.join(root, 'subset.tar.zst');
        fs.writeFileSync(file, archive);
        expect(await fetchArtifact({ from: file, kind: 'subset', cacheDir: root })).toBe(file);
        expect(await fetchArtifact({ from: root, kind: 'subset', cacheDir: root })).toBe(file);
        await expect(fetchArtifact({ from: root, kind: 'full', cacheDir: root })).rejects.toThrow(/does not exist/);
    });
});
