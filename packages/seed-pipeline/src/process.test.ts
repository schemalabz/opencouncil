import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable, Transform } from 'stream';
import zlib from 'zlib';
import { binary, redactUrl, resolvePgBin, run, Runner, tailLines, withholdRowValues } from './process';

describe('run', () => {
    test('captures stdout and passes stdin', async () => {
        const result = await run('cat', [], { input: 'hello' });
        expect(result).toEqual({ code: 0, stdout: 'hello', stderr: '' });
    });
    test('rejects on a non-zero exit with the stderr in the message', async () => {
        // No 's' (dotAll) flag: the project targets ES2017, which predates it.
        // [\s\S]* matches across newlines the same way '.' would with the flag.
        await expect(run('sh', ['-c', 'echo boom >&2; exit 3'])).rejects.toThrow(/exit 3[\s\S]*boom/);
    });
    test('keeps the row values of a DETAIL line out of the message', async () => {
        // The text comes through the environment, so the command line in the message does not carry it.
        const stderr = 'ERROR:  could not create unique index\nDETAIL:  Key (text)=(Οδός Ερμού 15) is duplicated.';
        const failure = run('sh', ['-c', 'printf "%s\\n" "$MSG" >&2; exit 1'], { env: { MSG: stderr } });
        await expect(failure).rejects.toThrow(/could not create unique index[\s\S]*DETAIL: \(withheld/);
        await expect(failure).rejects.not.toThrow(/Ερμού/);
    });
    test('isolatedEnv passes only the allowlist and the given variables', async () => {
        process.env.LOG_LEVEL = 'INFO';
        try {
            const shown = await run('sh', ['-c', 'echo "${LOG_LEVEL:-unset} ${PGPASSWORD:-unset} ${PATH:+path}"'], { env: { PGPASSWORD: 'p' }, isolatedEnv: true });
            expect(shown.stdout.trim()).toBe('unset p path');
            expect((await run('sh', ['-c', 'echo "${LOG_LEVEL:-unset}"'])).stdout.trim()).toBe('INFO');
        } finally {
            delete process.env.LOG_LEVEL;
        }
    });
    test('allowFailure returns the code instead', async () => {
        const result = await run('sh', ['-c', 'exit 2'], { allowFailure: true });
        expect(result.code).toBe(2);
    });
    test('does not crash the process on EPIPE when the child exits before reading all of stdin', async () => {
        const result = await run('sh', ['-c', 'exit 3'], { input: 'x'.repeat(300_000), allowFailure: true });
        expect(result.code).toBe(3);
    });
    test('hides the password of a URL argument in the failure message', async () => {
        const failure = run('sh', ['-c', 'exit 1', 'sh', 'postgresql://seed:s3cret@localhost/scratch']);
        await expect(failure).rejects.toThrow('postgresql://seed:***@localhost/scratch');
        await expect(failure).rejects.not.toThrow('s3cret');
    });
    test('does not end the failure message with a blank line when stderr is empty', async () => {
        const failure = run('sh', ['-c', 'exit 1']);
        await expect(failure).rejects.toThrow('sh -c exit 1 failed with exit 1');
        await failure.catch((error: Error) => {
            expect(error.message.endsWith('\n')).toBe(false);
        });
    });
    test('quotes only the last 50 lines of stderr in the failure message', async () => {
        const failure = run('sh', ['-c', 'i=1; while [ $i -le 80 ]; do echo "line$i" >&2; i=$((i+1)); done; exit 1']);
        await expect(failure).rejects.toThrow(/\(the last 50 of 80 lines\)\nline31\n[\s\S]*line80/);
        await expect(failure).rejects.not.toThrow(/line30\n/);
    });
    test('removes the libpq variables that can send a URL to another host, and keeps the variables the caller sets', async () => {
        const names = ['PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGSYSCONFDIR'];
        const previous = names.map((name) => process.env[name]);
        try {
            for (const name of names) process.env[name] = 'db.example.com';
            const result = await run('sh', ['-c', 'echo "$PGHOST|$PGHOSTADDR|$PGPORT|$PGUSER|$PGDATABASE|$PGSERVICE|$PGSERVICEFILE|$PGSYSCONFDIR|$PGPASSWORD|$PGOPTIONS"'], { env: { PGPASSWORD: 'pw', PGOPTIONS: '-c lc_messages=C' } });
            expect(result.stdout.trim()).toBe('||||||||pw|-c lc_messages=C');
            // The parent process keeps its own environment.
            expect(process.env.PGHOSTADDR).toBe('db.example.com');
        } finally {
            names.forEach((name, i) => {
                const value = previous[i];
                if (value === undefined) delete process.env[name];
                else process.env[name] = value;
            });
        }
    });
    test('pipes a stream chain into the child', async () => {
        const upper = new Transform({ transform: (chunk: Buffer, _encoding, done) => done(null, chunk.toString().toUpperCase()) });
        const result = await run('cat', [], { pipeFrom: [Readable.from([zlib.gzipSync('hello\n')]), zlib.createGunzip(), upper] });
        expect(result.stdout).toBe('HELLO\n');
    });
    test('reports the exit code of a child that stops reading, not the broken pipe', async () => {
        const big = Readable.from((function* () { for (let i = 0; i < 2000; i++) yield 'x'.repeat(64 * 1024); })());
        await expect(run('sh', ['-c', 'echo stopped >&2; exit 3'], { pipeFrom: [big] })).rejects.toThrow(/failed with exit 3\nstopped/);
    });
    test('rejects with the stream error after a clean exit', async () => {
        const broken = new Readable({ read() { this.destroy(new Error('not gzip')); } });
        await expect(run('cat', [], { pipeFrom: [broken] })).rejects.toThrow('not gzip');
    });
    test('decodes a multi-byte character that straddles two chunks', async () => {
        // Greek text is two bytes per character, so a large output splits characters
        // across chunk boundaries. A per-chunk toString() would emit U+FFFD there.
        const text = 'Δημοτικό Συμβούλιο '.repeat(20_000);
        const result = await run('cat', [], { input: text });
        expect(result.stdout).toBe(text);
        expect(result.stdout).not.toContain('\ufffd');
    });
});

describe('redactUrl', () => {
    test('hides the password and keeps the rest of the URL', () => {
        expect(redactUrl('postgresql://seed:s3cret@127.0.0.1:54390/scratch')).toBe('postgresql://seed:***@127.0.0.1:54390/scratch');
    });
    test('hides the password carried as a query parameter', () => {
        expect(redactUrl('postgresql://seed@localhost/db?password=s3cret')).toBe('postgresql://seed@localhost/db?password=***');
    });
    test('hides both a userinfo password and a query password', () => {
        expect(redactUrl('postgresql://seed:s3cret@localhost/db?password=also')).toBe('postgresql://seed:***@localhost/db?password=***');
    });
    test('hides every occurrence of a repeated query password', () => {
        expect(redactUrl('postgresql://seed@localhost/db?password=first&password=second')).toBe('postgresql://seed@localhost/db?password=***&password=***');
    });
    test('hides a password whose key is percent-encoded, as libpq decodes it', () => {
        expect(redactUrl('postgresql://seed@localhost/db?%70assword=s3cret&sslmode=disable')).toBe('postgresql://seed@localhost/db?%70assword=***&sslmode=disable');
    });
    test('leaves a URL without a password unchanged', () => {
        expect(redactUrl('postgresql://seed@127.0.0.1:54390/scratch')).toBe('postgresql://seed@127.0.0.1:54390/scratch');
    });
});

describe('tailLines', () => {
    test('keeps a short text whole', () => {
        expect(tailLines('a\nb\n', 3)).toBe('a\nb');
    });
    test('keeps the last lines of a long text and says how many it cut', () => {
        expect(tailLines('a\nb\nc\nd\n', 2)).toBe('(the last 2 of 4 lines)\nc\nd');
    });
});

describe('binary', () => {
    test('prefixes SEED_PG_BIN when set', () => {
        const previous = process.env.SEED_PG_BIN;
        try {
            process.env.SEED_PG_BIN = '/nix/store/x/bin';
            expect(binary('psql')).toBe('/nix/store/x/bin/psql');
            delete process.env.SEED_PG_BIN;
            expect(binary('psql')).toBe('psql');
        } finally {
            if (previous !== undefined) process.env.SEED_PG_BIN = previous;
            else delete process.env.SEED_PG_BIN;
        }
    });
});

describe('resolvePgBin', () => {
    let previous: string | undefined;
    let dir = '';
    beforeEach(() => {
        previous = process.env.SEED_PG_BIN;
        delete process.env.SEED_PG_BIN;
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-resolve-pg-'));
    });
    afterEach(() => {
        if (previous !== undefined) process.env.SEED_PG_BIN = previous;
        else delete process.env.SEED_PG_BIN;
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const failingRunner: Runner = () => Promise.reject(new Error('the runner must not be called'));

    test('keeps a SEED_PG_BIN that is set and builds nothing', async () => {
        fs.writeFileSync(path.join(dir, 'flake.nix'), '{}');
        process.env.SEED_PG_BIN = '/nix/store/given/bin';
        await expect(resolvePgBin({ cwd: dir, runner: failingRunner })).resolves.toBeUndefined();
        expect(process.env.SEED_PG_BIN).toBe('/nix/store/given/bin');
    });
    test('without flake.nix builds nothing and leaves the tools to PATH', async () => {
        await expect(resolvePgBin({ cwd: dir, runner: failingRunner })).resolves.toBeUndefined();
        expect(process.env.SEED_PG_BIN).toBeUndefined();
        expect(binary('psql')).toBe('psql');
    });
    test('in a checkout builds postgres-compat once and sets SEED_PG_BIN to its bin directory', async () => {
        fs.writeFileSync(path.join(dir, 'flake.nix'), '{}');
        const out = path.join(dir, 'store', 'postgresql-and-plugins-16');
        fs.mkdirSync(path.join(out, 'bin'), { recursive: true });
        fs.writeFileSync(path.join(out, 'bin', 'initdb'), '');
        const calls: { cmd: string; args: string[]; cwd?: string }[] = [];
        const runner: Runner = (cmd, args, opts) => {
            calls.push({ cmd, args, cwd: opts?.cwd });
            return Promise.resolve({ code: 0, stdout: `warning: Git tree is dirty\n${out}\n`, stderr: '' });
        };
        const lines: string[] = [];
        await expect(resolvePgBin({ cwd: dir, runner, log: (line) => lines.push(line) })).resolves.toBe(path.join(out, 'bin'));
        expect(calls).toEqual([{ cmd: 'nix', args: ['build', '.#postgres-compat', '--no-link', '--print-out-paths'], cwd: dir }]);
        expect(process.env.SEED_PG_BIN).toBe(path.join(out, 'bin'));
        expect(lines).toEqual([
            'building PostgreSQL with PostGIS 3.3.5 (first run compiles from source; this can take several minutes)',
            `postgres: ${path.join(out, 'bin')} (nix build .#postgres-compat)`,
        ]);
    });
    test('names nix run .#seed-pipeline when nix is missing', async () => {
        fs.writeFileSync(path.join(dir, 'flake.nix'), '{}');
        const runner: Runner = () => Promise.reject(Object.assign(new Error('spawn nix ENOENT'), { code: 'ENOENT' }));
        const failure = resolvePgBin({ cwd: dir, runner });
        await expect(failure).rejects.toThrow(/nix run \.#seed-pipeline/);
        await expect(failure).rejects.toMatchObject({ cause: { code: 'ENOENT' } });
        expect(process.env.SEED_PG_BIN).toBeUndefined();
    });
});

describe('withholdRowValues', () => {
    test('withholds the row values that Postgres and Prisma quote', () => {
        const text = [
            'psql:post-restore.sql:3: ERROR:  null value in column "contactEmails" violates not-null constraint',
            'DETAIL:  Failing row contains (b1, Council, {a@example.gr}).',
            'Database error: ERROR: duplicate key DETAIL: Key (text)=(Οδός Ερμού 15) is duplicated.',
            'DbError { severity: "ERROR", detail: Some("Key (id)=(x) already exists."), hint: None }',
        ].join('\n');
        const shown = withholdRowValues(text);
        expect(shown).not.toMatch(/a@example\.gr|Ερμού|Key \(id\)/);
        expect(shown).toMatch(/violates not-null constraint/);
        expect(shown.split('\n')).toHaveLength(4);
    });
});
