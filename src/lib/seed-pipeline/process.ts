import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { StringDecoder } from 'string_decoder';

export type RunResult = { code: number; stdout: string; stderr: string };
export type RunOptions = {
    env?: Partial<NodeJS.ProcessEnv>;
    cwd?: string;
    input?: string;
    /** A stream chain whose output becomes the child's stdin, in place of `input`. */
    pipeFrom?: [Readable, ...Transform[]];
    allowFailure?: boolean;
};

/**
 * `lc_messages=C` forces psql diagnostics into English so a matcher on the
 * "ERROR:" prefix works under any server locale. Setting it is superuser-only
 * (SUSET), so only a caller that connects as a superuser can send it. Exported
 * for `filteredRestore` in produce.ts, the one caller that qualifies.
 */
export const SUPERUSER_PSQL_ENV: Partial<NodeJS.ProcessEnv> = { PGOPTIONS: '-c lc_messages=C' };

/** Postgres client binaries come from SEED_PG_BIN when it is set (see `resolvePgBin`), else from PATH. */
export function binary(name: string): string {
    const bin = process.env.SEED_PG_BIN;
    return bin ? path.join(bin, name) : name;
}

export type Runner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>;

/** The flake package that holds the scratch cluster's Postgres: PostGIS 3.3.5, the version the migrations pin. */
export const PG_COMPAT_ATTR = '.#postgres-compat';

/**
 * Set SEED_PG_BIN for a command that starts a cluster or calls Postgres tools.
 * A value that is set already wins: the packaged CLI sets it, and so can the
 * caller. Outside a checkout (no flake.nix in `cwd`) the tools come from PATH.
 * In a checkout, `nix build` resolves the build once. `cache.nixos.org` does not
 * carry it, so the first build compiles PostGIS from source.
 * Returns the directory that it set, or undefined when it set nothing.
 */
export async function resolvePgBin(opts: { cwd?: string; runner?: Runner; log?: (line: string) => void } = {}): Promise<string | undefined> {
    if (process.env.SEED_PG_BIN) return undefined;
    const cwd = opts.cwd ?? process.cwd();
    if (!fs.existsSync(path.join(cwd, 'flake.nix'))) return undefined;
    const runner = opts.runner ?? run;
    opts.log?.('building PostgreSQL with PostGIS 3.3.5 (first run compiles from source; this can take several minutes)');
    let stdout: string;
    try {
        ({ stdout } = await runner('nix', ['build', PG_COMPAT_ATTR, '--no-link', '--print-out-paths'], { cwd }));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error('SEED_PG_BIN is not set and nix is not on PATH, so the PostGIS 3.3.5 Postgres cannot be built. Use `nix run .#seed-pipeline -- <command>` instead, or set SEED_PG_BIN.', { cause: error });
        }
        throw error;
    }
    const out = stdout.trim().split('\n').pop()?.trim() ?? '';
    const bin = path.join(out, 'bin');
    if (!out || !fs.existsSync(path.join(bin, 'initdb'))) {
        throw new Error(`nix build ${PG_COMPAT_ATTR} printed "${out}", which has no bin/initdb`);
    }
    process.env.SEED_PG_BIN = bin;
    opts.log?.(`postgres: ${bin} (nix build ${PG_COMPAT_ATTR})`);
    return bin;
}

/**
 * Hide the password of a connection URL, so a log line can carry the URL.
 * Redacts the password in the userinfo part, and the value of every
 * `password=` query parameter (libpq accepts a URL that carries the
 * password that way instead).
 */
export function redactUrl(url: string): string {
    return url
        .replace(/^([a-z][a-z0-9+.-]*:\/\/[^:/?#@]*):[^@/]*@/i, '$1:***@')
        .replace(/([?&]password=)[^&#]*/gi, '$1***');
}

/** The upper limit of stderr lines that a failure message of `run` quotes. */
const MAX_STDERR_LINES = 50;

/** The number of log lines that a failure message quotes by default. */
const LOG_TAIL_LINES = 30;

/** The default `log` of the seed commands. */
export function logToStderr(line: string): void {
    process.stderr.write(line + '\n');
}

/** The last `count` lines of `text`, with a note when lines were cut. */
export function tailLines(text: string, count = LOG_TAIL_LINES): string {
    const lines = text.replace(/\n$/, '').split('\n');
    if (lines.length <= count) return lines.join('\n');
    return [`(the last ${count} of ${lines.length} lines)`, ...lines.slice(-count)].join('\n');
}

/**
 * libpq reads these variables when a URL does not set the same parameter.
 * PGHOSTADDR wins over the host of a URL, a service entry can name any host,
 * and PGPORT, PGUSER, and PGDATABASE fill in what a URL leaves out. So each one
 * can send a URL that `assertLocalTarget` accepted to another database. The
 * child processes of the seed tools do not get them.
 */
const LIBPQ_REDIRECT_VARIABLES = ['PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGSYSCONFDIR'];

/** The environment of a child process: this process's environment without the libpq redirect variables, plus `extra`. */
export function childEnv(extra: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const name of LIBPQ_REDIRECT_VARIABLES) delete env[name];
    return { ...env, ...extra };
}

export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { env: childEnv(opts.env), cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
        // A multi-byte character can straddle two chunks. A per-chunk toString()
        // turns the split bytes into replacement characters, so each stream keeps
        // a decoder that holds the incomplete bytes until the next chunk arrives.
        const outDecoder = new StringDecoder('utf8');
        const errDecoder = new StringDecoder('utf8');
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: Buffer) => { stdout += outDecoder.write(d); });
        child.stderr.on('data', (d: Buffer) => { stderr += errDecoder.write(d); });
        // A child that exits before reading all of stdin (e.g. psql with ON_ERROR_STOP
        // stopping on the first error) makes the write raise EPIPE, which hides the
        // cause. So the exit code decides first, and a pipe error counts only after
        // a clean exit.
        child.stdin.on('error', () => {});
        const piped: Promise<Error | null> = opts.pipeFrom
            ? pipeline([...opts.pipeFrom, child.stdin]).then(() => null, (error: unknown) => (error instanceof Error ? error : new Error(String(error))))
            : Promise.resolve(null);
        child.on('error', reject);
        child.on('close', (code, signal) => {
            stdout += outDecoder.end();
            stderr += errDecoder.end();
            const result = { code: code ?? -1, stdout, stderr };
            void piped.then((pipeError) => {
                if (result.code !== 0 && !opts.allowFailure) {
                    const signalNote = signal ? ` (signal ${signal})` : '';
                    // An argument can be a connection URL with a password.
                    const shownArgs = args.map(redactUrl).join(' ');
                    // Empty stderr tails to an empty string: add it only when it holds text,
                    // or the message ends with a blank line.
                    const tail = tailLines(stderr, MAX_STDERR_LINES);
                    const tailPart = tail ? `\n${tail}` : '';
                    reject(new Error(`${cmd} ${shownArgs} failed with exit ${result.code}${signalNote}${tailPart}`));
                } else if (pipeError) {
                    reject(pipeError);
                } else {
                    resolve(result);
                }
            });
        });
        if (!opts.pipeFrom) {
            if (opts.input !== undefined) child.stdin.write(opts.input);
            child.stdin.end();
        }
    });
}

/** Run a SQL script against a URL, stopping at the first error. */
export function psql(url: string, sql: string, opts: RunOptions = {}): Promise<RunResult> {
    return run(binary('psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', url], { ...opts, input: sql });
}

/** Run one query and return its single text value. */
export async function psqlValue(url: string, sql: string, opts: RunOptions = {}): Promise<string> {
    const result = await run(binary('psql'), ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', url, '-c', sql], opts);
    return result.stdout.trim();
}
