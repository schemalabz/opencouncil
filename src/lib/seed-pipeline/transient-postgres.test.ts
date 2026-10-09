import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runningClusters, startTransientPostgres, withScratchCluster } from './transient-postgres';
import { psqlValue } from './process';

// The dev shell's postgresql_16 on PATH has no PostGIS extension, so it cannot run
// the real-cluster tests. They run only when SEED_PG_BIN points at the flake's
// PostGIS-enabled Postgres. The dev shell unsets it, so set it inside the command:
//   nix develop --command bash -c 'export SEED_PG_BIN="$(nix build .#postgres-compat --no-link --print-out-paths)/bin"; npx jest src/lib/seed-pipeline/transient-postgres.test.ts'
function hasSeedPgBin(): boolean {
    const bin = process.env.SEED_PG_BIN;
    return bin !== undefined && fs.existsSync(path.join(bin, 'initdb'));
}

const maybe = hasSeedPgBin() ? describe : describe.skip;

maybe('startTransientPostgres', () => {
    test('starts a socket-only private cluster, creates a database with PostGIS, and stops', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-transient-'));
        const pg = await startTransientPostgres({ dir });
        const socketDir = pg.conn('probe').host;
        try {
            await pg.createDatabase('probe');
            await psqlValue(pg.url('probe'), 'CREATE EXTENSION postgis');
            expect(await psqlValue(pg.url('probe'), 'SELECT current_database()')).toBe('probe');
            expect(await psqlValue(pg.url('probe'), 'SHOW listen_addresses')).toBe('');
            expect(await psqlValue(pg.url('probe'), 'SHOW unix_socket_permissions')).toBe('0700');
            expect(fs.statSync(socketDir).mode & 0o777).toBe(0o700);
            expect(fs.statSync(path.join(path.dirname(pg.dataDir), 'postgres.log')).mode & 0o777).toBe(0o600);
        } finally {
            await pg.stop();
        }
        expect(fs.existsSync(socketDir)).toBe(false);
        // The data directory and the server log hold table rows, so stop removes them.
        expect(fs.existsSync(path.dirname(pg.dataDir))).toBe(false);
        fs.rmSync(dir, { recursive: true, force: true });
    }, 120_000);

    test('a second cluster in the same work directory starts, and its stop leaves the first one running', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-transient-'));
        const first = await startTransientPostgres({ dir });
        try {
            const second = await startTransientPostgres({ dir });
            expect(second.dataDir).not.toBe(first.dataDir);
            await second.stop();
            expect(await psqlValue(first.url('postgres'), 'SELECT 1')).toBe('1');
        } finally {
            await first.stop();
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, 120_000);
});

/**
 * Fake initdb and pg_ctl. initdb refuses a data directory that is not empty,
 * as the real one does. pg_ctl appends each action to $FAKE_PG_CTL_CALLS.
 * FAKE_INITDB, FAKE_PG_CTL_START, and FAKE_PG_CTL_STOP set to "fail" make
 * that step exit 1. A failed start writes 40 lines to the server log.
 */
const FAKE_INITDB = `#!/bin/sh
while [ $# -gt 0 ]; do case "$1" in -D) d="$2"; shift;; esac; shift; done
if [ "$FAKE_INITDB" = fail ]; then echo "initdb: fake failure" >&2; exit 1; fi
if [ -d "$d" ] && [ -n "$(ls -A "$d")" ]; then echo "initdb: directory \\"$d\\" exists but is not empty" >&2; exit 1; fi
mkdir -p "$d" && touch "$d/PG_VERSION"
`;
const FAKE_PG_CTL = `#!/bin/sh
for a in "$@"; do action="$a"; done
echo "$action" >> "$FAKE_PG_CTL_CALLS"
while [ $# -gt 0 ]; do case "$1" in -l) log="$2"; shift;; esac; shift; done
if [ "$action" = start ] && [ "$FAKE_PG_CTL_START" = fail ]; then
  i=1; while [ $i -le 40 ]; do echo "log line $i" >> "$log"; i=$((i+1)); done
  echo "pg_ctl: could not start server" >&2; exit 1
fi
if [ "$action" = stop ] && [ "$FAKE_PG_CTL_STOP" = fail ]; then echo "pg_ctl: server does not shut down" >&2; exit 1; fi
exit 0
`;

describe('startTransientPostgres failure paths (fake binaries)', () => {
    const variables = ['SEED_PG_BIN', 'FAKE_INITDB', 'FAKE_PG_CTL_START', 'FAKE_PG_CTL_STOP', 'FAKE_PG_CTL_CALLS'];
    let previous: (string | undefined)[] = [];
    let root = '';
    let workDir = '';
    let callsFile = '';
    let socketDirs: string[] = [];

    beforeEach(() => {
        previous = variables.map((name) => process.env[name]);
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-fake-pg-'));
        const bin = path.join(root, 'bin');
        fs.mkdirSync(bin);
        fs.writeFileSync(path.join(bin, 'initdb'), FAKE_INITDB, { mode: 0o755 });
        fs.writeFileSync(path.join(bin, 'pg_ctl'), FAKE_PG_CTL, { mode: 0o755 });
        workDir = path.join(root, 'work');
        callsFile = path.join(root, 'calls');
        process.env.SEED_PG_BIN = bin;
        process.env.FAKE_PG_CTL_CALLS = callsFile;
        delete process.env.FAKE_INITDB;
        delete process.env.FAKE_PG_CTL_START;
        delete process.env.FAKE_PG_CTL_STOP;
        // Record the socket directories that startTransientPostgres makes under /tmp.
        const mkdtemp = fs.mkdtempSync;
        socketDirs = [];
        jest.spyOn(fs, 'mkdtempSync').mockImplementation((prefix, options) => {
            const made = mkdtemp(prefix, options);
            if (String(prefix).startsWith('/tmp/oc-seed-')) socketDirs.push(String(made));
            return made;
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        variables.forEach((name, i) => {
            const value = previous[i];
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        });
        for (const dir of socketDirs) fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(root, { recursive: true, force: true });
    });

    const calls = () => (fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').trim().split('\n') : []);

    test('a missing initdb reports its own error, and the socket directory goes', async () => {
        process.env.SEED_PG_BIN = path.join(root, 'empty');
        fs.mkdirSync(process.env.SEED_PG_BIN);
        const failure = startTransientPostgres({ dir: workDir, log: () => undefined });
        await expect(failure).rejects.toThrow(/initdb ENOENT/);
        expect(socketDirs).toHaveLength(1);
        expect(fs.existsSync(socketDirs[0])).toBe(false);
    });

    test('a failed initdb does not run pg_ctl stop', async () => {
        process.env.FAKE_INITDB = 'fail';
        await expect(startTransientPostgres({ dir: workDir, log: () => undefined })).rejects.toThrow(/initdb: fake failure/);
        expect(calls()).toEqual([]);
        expect(fs.existsSync(socketDirs[0])).toBe(false);
    });

    test('a failed start quotes the end of postgres.log, stops the postmaster, and removes the socket directory', async () => {
        process.env.FAKE_PG_CTL_START = 'fail';
        const failure = startTransientPostgres({ dir: workDir, log: () => undefined });
        await expect(failure).rejects.toThrow(/did not start[\s\S]*\(the last 30 of 40 lines\)\nlog line 11\n[\s\S]*log line 40$/);
        await expect(failure).rejects.toMatchObject({ cause: { message: expect.stringMatching(/could not start server/) } });
        await expect(failure).rejects.not.toThrow(/can still run/);
        expect(calls()).toEqual(['start', 'stop']);
        expect(fs.existsSync(socketDirs[0])).toBe(false);
    });

    test('a failed start whose stop fails too keeps the socket directory and names the stop command', async () => {
        process.env.FAKE_PG_CTL_START = 'fail';
        process.env.FAKE_PG_CTL_STOP = 'fail';
        const failure = startTransientPostgres({ dir: workDir, log: () => undefined });
        await expect(failure).rejects.toThrow(/did not start[\s\S]*The scratch cluster can still run\. Stop it with: '.*pg_ctl' -D '.*pgdata' -m fast stop && rm -rf /);
        await expect(failure).rejects.toMatchObject({ cause: { message: expect.stringMatching(/could not start server/) } });
        expect(calls()).toEqual(['start', 'stop']);
        expect(fs.existsSync(socketDirs[0])).toBe(true);
    });

    test('a failed start names the log file only when the work directory is kept', async () => {
        process.env.FAKE_PG_CTL_START = 'fail';
        await expect(startTransientPostgres({ dir: workDir, log: () => undefined })).rejects.not.toThrow(/full log:/);
        await expect(startTransientPostgres({ dir: workDir, workDirKept: true, log: () => undefined })).rejects.toThrow(/full log: .*postgres\.log/);
    });

    test('a second start in the same work directory gets its own data directory', async () => {
        const first = await startTransientPostgres({ dir: workDir, log: () => undefined });
        const second = await startTransientPostgres({ dir: workDir, log: () => undefined });
        expect(second.dataDir).not.toBe(first.dataDir);
        await second.stop();
        await first.stop();
    });

    test('stop removes the cluster directory and the socket directory', async () => {
        const pg = await startTransientPostgres({ dir: workDir, log: () => undefined });
        await pg.stop();
        expect(fs.existsSync(path.dirname(pg.dataDir))).toBe(false);
        expect(fs.existsSync(socketDirs[0])).toBe(false);
    });

    test('a failed stop keeps the data directory and logs it with the stop command', async () => {
        const lines: string[] = [];
        const pg = await startTransientPostgres({ dir: workDir, log: (line) => lines.push(line) });
        process.env.FAKE_PG_CTL_STOP = 'fail';
        await pg.stop();
        expect(fs.existsSync(pg.dataDir)).toBe(true);
        expect(lines.join('\n')).toContain(pg.dataDir);
        expect(lines.join('\n')).toContain(`stop it with: ${pg.stopCommand}`);
        expect(pg.stopCommand).toMatch(/pg_ctl' -D '.*pgdata' -m fast stop && rm -rf /);
    });

    test('a second stop while the first runs calls pg_ctl stop once', async () => {
        const pg = await startTransientPostgres({ dir: workDir, log: () => undefined });
        await Promise.all([pg.stop(), pg.stop()]);
        expect(calls().filter((call) => call.includes('stop'))).toHaveLength(1);
    });

    test('withScratchCluster stops the cluster when its function throws, and removes its signal handlers', async () => {
        const listeners = process.listenerCount('SIGINT');
        const run = withScratchCluster({ workDir, log: () => undefined }, async () => {
            expect(process.listenerCount('SIGINT')).toBe(listeners + 1);
            throw new Error('the work failed');
        });
        await expect(run).rejects.toThrow('the work failed');
        expect(calls().filter((call) => call.includes('stop'))).toHaveLength(1);
        expect(process.listenerCount('SIGINT')).toBe(listeners);
    });

    test('withScratchCluster stops the cluster when the process gets SIGINT', async () => {
        // A child process runs the helper, as the CLI does, and waits. Ctrl-C sends it SIGINT.
        const script = path.join(root, 'wait.ts');
        fs.writeFileSync(script, [
            `import { withScratchCluster } from ${JSON.stringify(path.resolve('src/lib/seed-pipeline/transient-postgres'))};`,
            `void withScratchCluster({ workDir: ${JSON.stringify(workDir)}, log: (line) => console.log(line) }, async () => {`,
            "    console.log('READY');",
            '    await new Promise(() => setInterval(() => undefined, 1000));',
            '});',
        ].join('\n'));
        const child = spawn(path.resolve('node_modules/.bin/tsx'), [script], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const exited = new Promise<number | null>((resolve) => child.on('close', resolve));
        await new Promise<void>((resolve, reject) => {
            child.stdout.on('data', (d: Buffer) => {
                output += d.toString();
                if (output.includes('READY')) resolve();
            });
            child.on('close', () => reject(new Error(`the child exited before it was ready:\n${output}`)));
        });
        child.kill('SIGINT');
        expect(await exited).toBe(130);
        expect(output).toContain('SIGINT: stopping the scratch cluster');
        expect(calls().filter((call) => call.includes('stop'))).toHaveLength(1);
    }, 30_000);

    test('withScratchCluster keeps a cluster that `keep` asks for', async () => {
        const lines: string[] = [];
        await withScratchCluster({ workDir, keep: true, log: (line) => lines.push(line) }, async () => undefined);
        expect(calls().filter((call) => call.includes('stop'))).toHaveLength(0);
        expect(lines.join('\n')).toContain('stop it with:');
    });
});

describe('runningClusters', () => {
    let workDir = '';
    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-running-'));
    });
    afterEach(() => {
        fs.rmSync(workDir, { recursive: true, force: true });
    });

    test('names a data directory that still has postmaster.pid, and only that one', () => {
        const running = path.join(workDir, 'cluster', 'cluster-a', 'pgdata');
        const stopped = path.join(workDir, 'cluster', 'cluster-b', 'pgdata');
        fs.mkdirSync(running, { recursive: true });
        fs.mkdirSync(stopped, { recursive: true });
        fs.writeFileSync(path.join(running, 'postmaster.pid'), '1234\n');
        expect(runningClusters(workDir)).toEqual([running]);
    });

    test('is empty for a work directory without clusters', () => {
        expect(runningClusters(workDir)).toEqual([]);
    });
});
