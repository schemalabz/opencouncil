/**
 * Black-box test of telemetry.cjs: the preload runs in a child process, started
 * with `node --require` as `production:start` starts Next, and exports to a local
 * OTLP receiver in this process. Nothing reaches PostHog.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const ROOT = resolve(__dirname, '../..');
const TELEMETRY = join(ROOT, 'telemetry.cjs');
const FIXTURE = join(__dirname, 'fixtures', 'telemetry.fixture.cjs');
// PostHog drops a request over 2 MB whole.
const POSTHOG_REQUEST_LIMIT = 2 * 1024 * 1024;

interface OtlpValue { stringValue?: string; intValue?: string | number; boolValue?: boolean }
interface OtlpKeyValue { key: string; value: OtlpValue }
interface OtlpLogRecord {
    severityNumber: number;
    severityText: string;
    body: OtlpValue;
    attributes?: OtlpKeyValue[];
    traceId?: string;
    spanId?: string;
}
interface OtlpExport {
    resourceLogs: { resource: { attributes: OtlpKeyValue[] }; scopeLogs: { logRecords: OtlpLogRecord[] }[] }[];
}
interface Export { headers: IncomingHttpHeaders; raw: string; records: OtlpLogRecord[]; resource: Record<string, unknown> }
interface LogRecord { body: string; severityText: string; traceId?: string; spanId?: string; attributes: Record<string, unknown> }

function value(v: OtlpValue): unknown {
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.intValue !== undefined) return Number(v.intValue);
    if (v.boolValue !== undefined) return v.boolValue;
    return undefined;
}
const toObject = (kvs: OtlpKeyValue[] = []) => Object.fromEntries(kvs.map(({ key, value: v }) => [key, value(v)]));

/** A local OTLP logs receiver: keeps each export, gunzipped and parsed. */
async function startReceiver(status = 200): Promise<{ server: Server; url: string; exports: Export[] }> {
    const exports: Export[] = [];
    const server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
            const body = Buffer.concat(chunks);
            const raw = (req.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body).toString('utf8');
            const parsed = JSON.parse(raw) as OtlpExport;
            exports.push({
                headers: req.headers,
                raw,
                records: parsed.resourceLogs.flatMap(r => r.scopeLogs.flatMap(s => s.logRecords)),
                resource: toObject(parsed.resourceLogs[0]?.resource.attributes),
            });
            res.writeHead(status, { 'content-type': 'application/json' }).end('{}');
        });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    return { server, url: `http://127.0.0.1:${address.port}/v1/logs`, exports };
}

interface Child { process: ChildProcess; stdout: () => string; stderr: () => string; exited: Promise<number | string | null> }

function startFixture(env: Record<string, string | undefined>): Child {
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, ['--require', TELEMETRY, FIXTURE], {
        env: { PATH: process.env.PATH, NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=512', ...env },
    });
    child.stdout!.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr!.on('data', (c: Buffer) => { stderr += c.toString(); });
    const exited = new Promise<number | string | null>(r => child.on('exit', (code, signal) => r(code ?? signal)));
    return { process: child, stdout: () => stdout, stderr: () => stderr, exited };
}

async function waitFor(check: () => boolean, ms = 5000): Promise<void> {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) throw new Error('timed out');
        await new Promise(r => setTimeout(r, 20));
    }
}

function get(port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
    return new Promise((res, rej) => {
        const req = httpRequest({ host: '127.0.0.1', port, path, headers }, response => {
            let body = '';
            response.on('data', c => { body += c; });
            response.on('end', () => res({ status: response.statusCode ?? 0, body }));
        });
        req.on('error', rej);
        req.end();
    });
}

/** Starts a request, waits for its start line, then hangs up. */
async function abandon(child: Child, port: number, path: string): Promise<void> {
    const request = httpRequest({ host: '127.0.0.1', port, path });
    request.on('error', () => {});
    request.end();
    await waitFor(() => child.stdout().includes(` start GET ${path}\n`));
    request.destroy();
    await waitFor(() => new RegExp(`\\[request\\] \\w+ GET ${path} `).test(child.stdout()));
}

function records(exports: Export[]): LogRecord[] {
    return exports.flatMap(e => e.records).map(r => ({
        body: String(value(r.body)),
        severityText: r.severityText,
        traceId: r.traceId,
        spanId: r.spanId,
        attributes: toObject(r.attributes),
    }));
}

const TOKEN_ENV = { NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_test' };
const kill = (child: Child) => { if (child.process.exitCode === null) child.process.kill('SIGKILL'); };

jest.setTimeout(30_000);

describe('telemetry.cjs with a token', () => {
    let receiver: Awaited<ReturnType<typeof startReceiver>>;
    let child: Child;
    let port: number;
    let all: LogRecord[];
    let byPath: (path: string) => LogRecord | undefined;
    let childNodeOptions: string;
    let exitCode: number | string | null;
    const TRACE_FROM_CLIENT = '4bf92f3577b34da6a3ce929d0e0e4736';

    beforeAll(async () => {
        receiver = await startReceiver();
        child = startFixture({ ...TOKEN_ENV, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: receiver.url, NEXT_PUBLIC_BUILD_COMMIT_SHA: 'abc1234' });
        await waitFor(() => /LISTENING (\d+)/.test(child.stdout()));
        port = Number(/LISTENING (\d+)/.exec(child.stdout())![1]);

        await get(port, '/ok', { 'do-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.66', 'user-agent': 'test-agent/1' });
        await get(port, '/forwarded', { 'x-forwarded-for': '198.51.100.66' });
        await get(port, '/el/athens');
        await get(port, '/api/health');
        await get(port, '/api/health?fail=1');
        await get(port, '/missing');
        await get(port, '/boom');
        await get(port, '/traced', { traceparent: `00-${TRACE_FROM_CLIENT}-00f067aa0ba902b7-01` });
        await get(port, '/mcp/mcp_SECRET-KEY_123?x=1');
        await get(port, '/api/join/JOINTOKEN?confirmed=JOINSIG');
        await get(port, '//api/join/SLASHTOKEN');
        await get(port, '/api//join/INNERTOKEN');
        await get(port, '/el/unsubscribe?token=QUERYTOKEN');
        await get(port, '/_next/static/chunk.js');
        await get(port, '/big');
        await get(port, '/many');
        childNodeOptions = (await get(port, '/child')).body;

        await abandon(child, port, '/hang');
        await abandon(child, port, '/hang500');

        // The last record before SIGTERM must still be sent: well inside the 1 s batch delay.
        await get(port, '/last');
        child.process.kill('SIGTERM');
        exitCode = await child.exited;

        all = records(receiver.exports);
        byPath = path => all.find(r => r.attributes['url.path'] === path && 'duration_ms' in r.attributes);
    });

    afterAll(async () => {
        kill(child);
        await new Promise(r => receiver.server.close(r));
    });

    it('sends one record per request, with its severity from the status', () => {
        expect(byPath('/ok')).toMatchObject({ severityText: 'info', attributes: { 'http.response.status_code': 200, aborted: false } });
        expect(byPath('/missing')).toMatchObject({ severityText: 'warn', attributes: { 'http.response.status_code': 404 } });
        expect(byPath('/boom')).toMatchObject({ severityText: 'error', attributes: { 'http.response.status_code': 500 } });
        expect(all.filter(r => r.attributes['url.path'] === '/ok')).toHaveLength(1);
    });

    it('carries the route that Next writes onto the request span', () => {
        expect(byPath('/el/athens')!.attributes['http.route']).toBe('/[locale]/[cityId]');
        expect(byPath('/ok')!.attributes).not.toHaveProperty('http.route');
    });

    it('records a request the client aborted as a warning without a status, even after a 5xx status', () => {
        for (const path of ['/hang', '/hang500']) {
            const record = byPath(path);
            expect(record).toMatchObject({ severityText: 'warn', attributes: { aborted: true } });
            expect(record!.attributes).not.toHaveProperty('http.response.status_code');
        }
        expect(child.stdout()).toMatch(/\[request\] [0-9a-f]{16} GET \/hang aborted \d+ms\n/);
    });

    it('takes the client address from do-connecting-ip, and never from X-Forwarded-For', () => {
        expect(byPath('/ok')!.attributes).toMatchObject({ 'client.address': '203.0.113.7', 'user_agent.original': 'test-agent/1' });
        expect(byPath('/forwarded')!.attributes['client.address']).toBe('127.0.0.1');
    });

    it('gives a console line the trace id and span id of its request', () => {
        const line = all.find(r => r.body === 'inside /ok');
        expect(line?.traceId).toBeTruthy();
        expect(line!.traceId).toBe(byPath('/ok')!.traceId);
        expect(line!.spanId).toBe(byPath('/ok')!.spanId);
    });

    it('ignores the trace id in an incoming traceparent header', () => {
        expect(byPath('/traced')!.traceId).toBeTruthy();
        expect(byPath('/traced')!.traceId).not.toBe(TRACE_FROM_CLIENT);
    });

    it('keeps query strings and path credentials out of the records and of stdout', () => {
        expect(byPath('/mcp/mcp_[redacted]')).toBeDefined();
        expect(byPath('/api/join/[redacted]')).toBeDefined();
        expect(byPath('//api/join/[redacted]')).toBeDefined();
        expect(byPath('/el/unsubscribe')).toBeDefined();
        const everything = receiver.exports.map(e => e.raw).join('\n') + child.stdout();
        for (const secret of ['SECRET-KEY_123', 'JOINTOKEN', 'JOINSIG', 'SLASHTOKEN', 'INNERTOKEN', 'QUERYTOKEN']) {
            expect(everything).not.toContain(secret);
        }
    });

    it('prints a start line and an end line with the full span id of the record, without the address', () => {
        const ids = [...child.stdout().matchAll(/\[request\] ([0-9a-f]{16}) (?:start GET \/ok|GET \/ok 200 \d+ms)\n/g)].map(m => m[1]);
        expect(ids).toHaveLength(2);
        expect(ids[0]).toBe(ids[1]);
        expect(byPath('/ok')!.spanId!.toLowerCase()).toBe(ids[0]);
        expect(child.stdout()).not.toContain('203.0.113.7');
    });

    it('sends no record and prints no line for /_next/static/', () => {
        expect(all.some(r => String(r.attributes['url.path']).startsWith('/_next/static/'))).toBe(false);
        expect(child.stdout()).not.toContain('/_next/static/');
    });

    it('cuts a long body to 16,000 bytes once JSON-escaped, on a character boundary', () => {
        const big = all.find(r => r.body.startsWith('aαα'))!;
        expect(big.body).toMatch(/… \[truncated \d+ characters\]$/);
        expect(Buffer.byteLength(JSON.stringify(big.body), 'utf8') - 2).toBeLessThanOrEqual(16_000);
        expect(big.body).not.toContain('�');
    });

    it('sends gzipped batches of at most 50 records with the token', () => {
        expect(all.filter(r => /^line \d+$/.test(r.body))).toHaveLength(250);
        for (const e of receiver.exports) {
            expect(e.records.length).toBeLessThanOrEqual(50);
            expect(e.headers['content-encoding']).toBe('gzip');
            expect(e.headers.authorization).toBe('Bearer phc_test');
        }
    });

    it('names the container and the build', () => {
        expect(receiver.exports[0].resource['service.instance.id']).toBe(hostname());
        expect(receiver.exports[0].resource['service.version']).toBe('abc1234');
    });

    it('sends a record for a failed health check only, and prints both lines for every check', () => {
        const health = all.filter(r => r.attributes['url.path'] === '/api/health');
        expect(health).toHaveLength(1);
        expect(health[0]).toMatchObject({ severityText: 'error', attributes: { 'http.response.status_code': 500 } });
        expect(child.stdout().match(/\[request\] [0-9a-f]{16} GET \/api\/health 200 \d+ms\n/g)).toHaveLength(1);
    });

    it('does not reach a child process', () => {
        expect(childNodeOptions).toBe('--max-old-space-size=512');
    });

    it('sends the last records before the app exits on SIGTERM', () => {
        expect(exitCode).toBe(0);
        expect(byPath('/last')).toBeDefined();
    });
});

describe('telemetry.cjs batch size', () => {
    let receiver: Awaited<ReturnType<typeof startReceiver>>;
    let child: Child;
    afterEach(async () => {
        kill(child);
        await new Promise(r => receiver.server.close(r));
    });

    it('keeps every export under 2 MB, with long client paths and escaped bodies', async () => {
        receiver = await startReceiver();
        child = startFixture({ ...TOKEN_ENV, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: receiver.url });
        await waitFor(() => /LISTENING (\d+)/.test(child.stdout()));
        const port = Number(/LISTENING (\d+)/.exec(child.stdout())![1]);
        // The client controls the path and the user agent; Node accepts 16 KB of headers.
        const longPath = `/${'p'.repeat(8_000)}`;
        const longAgent = 'u'.repeat(7_000);
        await Promise.all(Array.from({ length: 100 }, () => get(port, longPath, { 'user-agent': longAgent })));
        await Promise.all(Array.from({ length: 100 }, () => get(port, '/escaped')));
        child.process.kill('SIGTERM');
        await child.exited;

        expect(records(receiver.exports).filter(r => r.body.startsWith('"'))).toHaveLength(100);
        for (const e of receiver.exports) expect(Buffer.byteLength(e.raw, 'utf8')).toBeLessThan(POSTHOG_REQUEST_LIMIT);
    });
});

describe('telemetry.cjs at the edges', () => {
    let receiver: Awaited<ReturnType<typeof startReceiver>> | undefined;
    let child: Child | undefined;
    afterEach(async () => {
        if (child) kill(child);
        if (receiver) await new Promise(r => receiver!.server.close(r));
        child = undefined;
        receiver = undefined;
    });

    it('does nothing without a token', async () => {
        receiver = await startReceiver();
        child = startFixture({ OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: receiver.url });
        await waitFor(() => /LISTENING (\d+)/.test(child!.stdout()));
        await get(Number(/LISTENING (\d+)/.exec(child.stdout())![1]), '/ok');
        child.process.kill('SIGTERM');
        await child.exited;
        expect(child.stdout()).toContain('[telemetry] off');
        expect(child.stdout()).not.toContain('[request]');
        expect(receiver.exports).toHaveLength(0);
    });

    it('lets the app start when the setup fails', async () => {
        child = startFixture({ ...TOKEN_ENV, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'not a url' });
        await waitFor(() => /LISTENING (\d+)/.test(child!.stdout()) || child!.process.exitCode !== null);
        expect(child.stderr()).toContain('[telemetry] off');
        expect(child.stdout()).toMatch(/LISTENING \d+/);
    });

    it('writes a failed export to stderr', async () => {
        receiver = await startReceiver(400);
        child = startFixture({ ...TOKEN_ENV, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: receiver.url, FIXTURE_MODE: 'bare' });
        await waitFor(() => child!.stdout().includes('READY'));
        await waitFor(() => child!.stderr().includes('[telemetry]'));
        expect(child.stderr()).toMatch(/\[telemetry\] .*Bad Request/);
    });

    it('sends the last records before the boot probe exits', async () => {
        receiver = await startReceiver();
        child = startFixture({ ...TOKEN_ENV, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: receiver.url, FIXTURE_MODE: 'boot-exit' });
        expect(await child.exited).toBe(1);
        expect(records(receiver.exports).map(r => r.body)).toContain('fatal boot line');
    });

    it('stops on SIGTERM before the app has a handler', async () => {
        receiver = await startReceiver();
        child = startFixture({ ...TOKEN_ENV, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: receiver.url, FIXTURE_MODE: 'bare' });
        await waitFor(() => child!.stdout().includes('READY'));
        child.process.kill('SIGTERM');
        const result = await Promise.race([child.exited, new Promise(r => setTimeout(r, 5000, 'still running').unref())]);
        expect(result).toBe('SIGTERM');
    });

    it('sends nothing from a worker thread', async () => {
        receiver = await startReceiver();
        child = startFixture({ ...TOKEN_ENV, OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: receiver.url, FIXTURE_MODE: 'worker' });
        await waitFor(() => child!.stdout().includes('WORKER DONE'));
        expect(child.stdout().match(/\[telemetry\] sending/g)).toHaveLength(1);
    });
});
