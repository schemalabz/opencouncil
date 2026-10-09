import fs from 'fs';
import path from 'path';
import { ConnectionInfo } from './greenmask-config';
import { binary, logToStderr, run, tailLines } from './process';

export type TransientPostgres = {
    port: number;
    /** The data directory. It holds table rows until `stop` removes it. */
    dataDir: string;
    /** A shell command that stops the cluster and removes its directories. */
    stopCommand: string;
    url(database: string): string;
    conn(database: string): ConnectionInfo;
    createDatabase(name: string): Promise<void>;
    stop(): Promise<void>;
};

export type TransientPostgresOptions = {
    /** The parent directory. Each start makes its own directory inside it. */
    dir: string;
    /** True when `dir` outlives the run, so a failure message can name the server log. */
    workDirKept?: boolean;
    log?: (line: string) => void;
};

const OWNER = 'seed';

// The socket directory is private to one cluster, so the default port cannot
// collide with another cluster's socket.
const PORT = 5432;

/**
 * Make `dir` a directory that only this user can use. The caller can choose a
 * work directory in a shared place, where another user can create the path
 * first. So a symbolic link or a directory that another user owns is refused.
 */
function privateDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`${dir} is not a real directory. The scratch cluster uses only a real directory that you own.`);
    }
    const uid = process.getuid?.();
    if (uid !== undefined && stat.uid !== uid) {
        throw new Error(`${dir} belongs to uid ${stat.uid}. The scratch cluster uses only a directory that you own.`);
    }
    fs.chmodSync(dir, 0o700);
}

function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * A throwaway cluster for one pipeline run: trust auth, durability off. It holds
 * production rows before masking, so only the user who runs it can reach it:
 * no TCP listener, a socket in a private 0700 directory with
 * unix_socket_permissions=0700, and owner-only data and log files. The socket
 * directory lives under /tmp because socket paths are limited to 107 bytes.
 *
 * Each start makes a new directory under `opts.dir`. So a second run with the
 * same work directory does not meet the data directory of an earlier run, and
 * it never stops a cluster that an earlier run kept.
 */
export async function startTransientPostgres(opts: TransientPostgresOptions): Promise<TransientPostgres> {
    const log = opts.log ?? logToStderr;
    privateDir(opts.dir);
    // mkdtemp creates the directory with mode 0700.
    const clusterDir = fs.mkdtempSync(path.join(opts.dir, 'cluster-'));
    const dataDir = path.join(clusterDir, 'pgdata');
    const logFile = path.join(clusterDir, 'postgres.log');
    // A failed statement can write table rows into the server log.
    fs.closeSync(fs.openSync(logFile, 'a', 0o600));
    fs.chmodSync(logFile, 0o600);
    const socketDir = fs.mkdtempSync(path.join('/tmp', 'oc-seed-'));
    const stopArgs = ['-D', dataDir, '-m', 'fast', '-w', 'stop'];
    const stopCommand = `${shellQuote(binary('pg_ctl'))} -D ${shellQuote(dataDir)} -m fast stop && rm -rf ${shellQuote(clusterDir)} ${shellQuote(socketDir)}`;
    let ranStart = false;
    try {
        // initdb creates the data directory with mode 0700.
        await run(binary('initdb'), ['-D', dataDir, '-U', OWNER, '-A', 'trust', '--no-locale', '-E', 'UTF8']);
        const serverOptions = [
            `-p ${PORT}`, `-k ${socketDir}`, "-c listen_addresses=''", '-c unix_socket_permissions=0700',
            '-c fsync=off', '-c synchronous_commit=off', '-c full_page_writes=off',
            '-c shared_buffers=256MB', '-c maintenance_work_mem=256MB', '-c max_wal_size=4GB',
            // postgres.log then names every statement that ran 5 s or longer, with its time.
            '-c log_min_duration_statement=5000',
        ].join(' ');
        ranStart = true;
        try {
            await run(binary('pg_ctl'), ['-D', dataDir, '-l', logFile, '-o', serverOptions, '-w', 'start']);
        } catch (error) {
            // The caller can remove an automatic work directory before it prints
            // this error, so the message carries the end of the server log.
            const tail = tailLines(fs.readFileSync(logFile, 'utf8'));
            const where = opts.workDirKept ? `\nfull log: ${logFile}` : '';
            throw new Error(`the scratch cluster did not start. The end of postgres.log:\n${tail}${where}`, { cause: error });
        }
    } catch (error) {
        // pg_ctl start can fail after the postmaster came up (e.g. the wait
        // times out), so a run that reached it stops the postmaster.
        let stopped = !ranStart;
        if (ranStart) {
            try {
                stopped = (await run(binary('pg_ctl'), stopArgs, { allowFailure: true })).code === 0;
            } catch {
                // The error of the start is the one to report, not a cleanup error
                // such as a missing pg_ctl.
            }
        }
        if (stopped) {
            fs.rmSync(socketDir, { recursive: true, force: true });
        } else if (error instanceof Error) {
            // A postmaster that can still run keeps its socket and its data directory.
            error.message += `\nThe scratch cluster can still run. Stop it with: ${stopCommand}`;
        }
        throw error;
    }
    let stopping: Promise<void> | null = null;
    const url = (database: string) => `postgresql://${OWNER}@localhost:${PORT}/${database}?host=${socketDir}`;
    return {
        port: PORT,
        dataDir,
        stopCommand,
        url,
        conn: (database) => ({ host: socketDir, port: PORT, user: OWNER, database }),
        createDatabase: async (name) => {
            await run(binary('createdb'), ['-h', socketDir, '-p', String(PORT), '-U', OWNER, name]);
        },
        // A signal handler and a `finally` can both stop the cluster. The second call
        // waits for the first one instead of running pg_ctl on a stopped cluster.
        stop: () => {
            stopping ??= (async () => {
                const result = await run(binary('pg_ctl'), stopArgs, { allowFailure: true });
                if (result.code !== 0) {
                    // A running postmaster still needs its data directory, so it stays.
                    log(`pg_ctl stop exited with ${result.code}. The cluster can still run, and ${dataDir} holds its table rows.`);
                    log(`stop it with: ${stopCommand}`);
                    return;
                }
                // The data directory and the server log hold table rows.
                fs.rmSync(clusterDir, { recursive: true, force: true });
                fs.rmSync(socketDir, { recursive: true, force: true });
            })();
            return stopping;
        },
    };
}

/** Where `withScratchCluster` puts its clusters inside a work directory. */
function clustersDir(workDir: string): string {
    return path.join(workDir, 'cluster');
}

/**
 * The data directories under `workDir` whose postmaster can still run. Postgres
 * removes `postmaster.pid` when it stops, so a directory that still has one
 * belongs to a kept cluster or to one whose stop failed. Deleting it would take
 * the data directory away from a running server.
 */
export function runningClusters(workDir: string): string[] {
    const dir = clustersDir(workDir);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .map((name) => path.join(dir, name, 'pgdata'))
        .filter((dataDir) => fs.existsSync(path.join(dataDir, 'postmaster.pid')));
}

/**
 * Run `fn` with a transient cluster in `workDir`, and stop the cluster when `fn`
 * settles, unless `keep` is set. Ctrl-C or a SIGTERM also stops it: pg_ctl
 * detaches the postmaster, so the server would otherwise outlive the process
 * with the scratch rows in its data directory.
 */
export async function withScratchCluster<T>(
    o: { workDir: string; workDirKept?: boolean; keep?: boolean; log: (line: string) => void },
    fn: (cluster: TransientPostgres) => Promise<T>,
): Promise<T> {
    const cluster = await startTransientPostgres({ dir: clustersDir(o.workDir), workDirKept: o.workDirKept, log: o.log });
    const onSignal = (signal: NodeJS.Signals) => {
        o.log(`${signal}: stopping the scratch cluster`);
        void cluster.stop().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    try {
        return await fn(cluster);
    } finally {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
        if (o.keep) {
            o.log(`keeping the scratch cluster: ${cluster.url('postgres')}`);
            o.log(`stop it with: ${cluster.stopCommand}`);
        } else {
            await cluster.stop();
        }
    }
}
