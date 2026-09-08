/**
 * Seed pipeline: turn a SnapShooter backup into verified, personal-data-free
 * seed artifacts, and restore them into a local database.
 *
 * Usage:
 *   npm run seed-pipeline -- produce --backup production.sql.gz --out ./seed-out
 *   npm run seed-pipeline -- verify ./seed-out
 *   npm run seed-pipeline -- restore --from ./seed-out/subset.tar.zst --into postgresql://opencouncil@127.0.0.1:5433/opencouncil
 *   npm run seed-pipeline -- measure-tasks --db 'postgresql://seed@localhost:5432/scratch?host=/tmp/oc-seed-XXXXXX'
 *
 * Every command refuses a database host other than localhost.
 *
 * In a checkout without SEED_PG_BIN, `produce` and `verify` build the flake's
 * PostGIS 3.3.5 Postgres on first use (see `resolvePgBin`). Under `npm run
 * seed-pipeline`, `restore` needs only `pg_restore`, `psql`, and `prisma` —
 * client tools, not a server — so it never triggers that build. The packaged
 * app (`nix run .#seed-pipeline`) carries the PostGIS 3.3.5 build in its
 * runtime inputs for every command, `restore` included.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { withClient } from '@/lib/seed-pipeline/catalog';
import { meetingSetSql } from '@/lib/seed-pipeline/greenmask-config';
import { readManifest, MANIFEST_FILE } from '@/lib/seed-pipeline/manifest';
import { resolvePgBin } from '@/lib/seed-pipeline/process';
import { produce } from '@/lib/seed-pipeline/produce';
import { loadPinnedMeetings, pipelineHome } from '@/lib/seed-pipeline/tables';
import { runningClusters } from '@/lib/seed-pipeline/transient-postgres';
import { fileFailures, verify } from '@/lib/seed-pipeline/verify';
import { restoreArtifact } from '@/lib/seed/restore';
import { assertLocalTarget } from '@/lib/seed/target-guard';
import { formatError } from '@/lib/utils/errors';

function schemaPath(): string {
    const home = process.env.SEED_PIPELINE_HOME;
    return home ? path.join(home, '..', 'prisma', 'schema.prisma') : path.join(process.cwd(), 'prisma', 'schema.prisma');
}

/**
 * Run `fn` with a work directory. A given `--work` directory is the caller's:
 * it is left in place. An auto-created one is a temp dir owned by this run,
 * removed after `fn` settles — unless `keep` says the command left something
 * inside it that the caller still needs (`produce --keep-scratch` leaves its
 * kept cluster's data dir under the work dir), or a cluster in it still runs.
 * `fn` learns whether the
 * directory outlives the run, so a failure message names a log file only
 * when the file stays.
 */
async function withWorkDir(given: string | undefined, keep: boolean, fn: (dir: string, kept: boolean) => Promise<unknown>): Promise<void> {
    const owned = given === undefined;
    const dir = given ?? fs.mkdtempSync(path.join(os.tmpdir(), 'seed-pipeline-'));
    try {
        await fn(dir, !owned || keep);
    } finally {
        if (owned) {
            // A cluster whose stop failed still runs on its data directory here.
            const running = runningClusters(dir);
            if (keep || running.length) {
                console.error(`keeping work directory: ${dir}`);
            } else {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
    }
}

function assertLocalTargets(urls: (string | undefined)[]): void {
    for (const url of urls) if (url !== undefined) assertLocalTarget(url);
}

/**
 * Refuse a remote URL before the Postgres build, so a typo fails at once and
 * does not wait for a PostGIS compile. Only for `produce` and `verify`: they
 * start a cluster or call Postgres tools linked against it. `measure-tasks`
 * does not call this: it uses node-postgres only, and starts no cluster and
 * no Postgres tool. `restore` does not call this either: it needs `pg_restore`,
 * `psql`, and `prisma` only — client tools that the dev shell's `postgresql_16`
 * already provides — so it must not pay for compiling PostGIS 3.3.5 from source.
 */
async function preparePostgres(urls: (string | undefined)[]): Promise<void> {
    assertLocalTargets(urls);
    await resolvePgBin({ log: (line) => console.error(line) });
}

/**
 * An archive next to a manifest.json must be the one that manifest records. A
 * failed `produce` can leave an archive of another run beside it.
 */
async function assertMatchesManifest(tarPath: string): Promise<void> {
    const outDir = path.dirname(tarPath);
    if (!fs.existsSync(path.join(outDir, MANIFEST_FILE))) return;
    const info = Object.values(readManifest(outDir).files).find((file) => file.name === path.basename(tarPath));
    if (!info) throw new Error(`${MANIFEST_FILE} in ${outDir} does not record ${path.basename(tarPath)}`);
    const failures = await fileFailures(outDir, info);
    if (failures.length) throw new Error(`${tarPath} does not match ${MANIFEST_FILE}:\n${failures.join('\n')}`);
}

async function measureTasks(db: string, n: number): Promise<void> {
    assertLocalTarget(db);
    await withClient(db, async (client) => {
        // sel(c, m) is the contract measure-tasks.sql and expected-counts.sql both expect.
        await client.query('CREATE TEMP TABLE sel(c, m) AS ' + meetingSetSql({ pins: loadPinnedMeetings(), meetingsPerBody: n, asOf: new Date() }));
        const statements = fs.readFileSync(path.join(pipelineHome(), 'measure-tasks.sql'), 'utf8').split(';\n').map((s) => s.trim()).filter(Boolean);
        for (const statement of statements) {
            const { rows } = await client.query(statement);
            console.table(rows);
        }
    });
}

async function main(): Promise<void> {
    await yargs(hideBin(process.argv))
        .scriptName('seed-pipeline')
        .command('produce', 'Build subset.tar.zst, full.tar.zst, and manifest.json from a backup', (y) => y
            .option('backup', { type: 'string', demandOption: true, describe: 'Path to production.sql.gz' })
            .option('out', { type: 'string', demandOption: true, describe: 'Output directory' })
            .option('n', { type: 'number', default: 2, describe: 'Latest released meetings per administrative body' })
            .check((argv) => {
                if (!Number.isInteger(argv.n) || argv.n < 1) throw new Error(`--n must be a positive integer, got ${argv.n}`);
                return true;
            })
            .option('work', { type: 'string', describe: 'Work directory (default: a temp dir)' })
            .option('scratch-url', { type: 'string', describe: 'Use this empty local database instead of a transient cluster. Connect as a superuser: the restore sets lc_messages' })
            .option('keep-scratch', { type: 'boolean', default: false, describe: 'Keep the transient cluster and print the command that stops it' }),
        async (argv) => {
            await preparePostgres([argv['scratch-url']]);
            // With --scratch-url, produce starts no cluster, so --keep-scratch has nothing to keep.
            const keep = argv['keep-scratch'] && argv['scratch-url'] === undefined;
            await withWorkDir(argv.work, keep, (dir, kept) =>
                produce({
                    backupPath: argv.backup, outDir: argv.out, workDir: dir, schemaPath: schemaPath(), meetingsPerBody: argv.n,
                    scratchUrl: argv['scratch-url'], keepScratch: argv['keep-scratch'], workDirKept: kept,
                }),
            );
        })
        .command('verify <dir>', 'Restore both artifacts into throwaway databases and check them against the manifest', (y) => y
            .positional('dir', { type: 'string', demandOption: true })
            .option('work', { type: 'string' }),
        async (argv) => {
            await preparePostgres([]);
            await withWorkDir(argv.work, false, (dir, kept) =>
                verify({ outDir: argv.dir, workDir: dir, schemaPath: schemaPath(), workDirKept: kept }),
            );
        })
        .command('restore', 'Restore an artifact into an empty local database and apply migrations', (y) => y
            .option('from', { type: 'string', demandOption: true, describe: 'subset.tar.zst or full.tar.zst' })
            .option('into', { type: 'string', demandOption: true, describe: 'Local database URL' })
            .option('work', { type: 'string' }),
        async (argv) => {
            assertLocalTargets([argv.into]);
            await assertMatchesManifest(argv.from);
            await withWorkDir(argv.work, false, (dir) =>
                restoreArtifact({ tarPath: argv.from, databaseUrl: argv.into, schemaPath: schemaPath(), workDir: dir }),
            );
        })
        .command('measure-tasks', 'Report task-row sizes and the taskId invariant for the selected meetings', (y) => y
            .option('db', { type: 'string', demandOption: true, describe: 'Local scratch database URL' })
            .option('n', { type: 'number', default: 2 }),
        async (argv) => {
            await measureTasks(argv.db, argv.n);
        })
        .demandCommand(1)
        .strict()
        .help()
        // yargs calls .fail with err === undefined for its own validation
        // failures (bad or missing options): keep yargs's usual usage block
        // for that case. Any other call carries a rejected handler's thrown
        // value, Error or not: print it with formatError, not yargs's usage
        // block or the raw stack.
        .fail((msg, err, argParser) => {
            if (err === undefined) {
                argParser.showHelp();
                console.error(msg);
            } else {
                console.error(formatError(err));
            }
            process.exit(1);
        })
        .parseAsync();
}

main().catch((error: unknown) => {
    console.error(formatError(error));
    process.exit(1);
});
