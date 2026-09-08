import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { newestDumpDir, packArtifact } from './artifact';
import { constraintExists, fksOfTables, listForeignKeys, listIndexColumns, listPgSyncObjects, listTables, migrationHead, misorderedCompositeFks, selfReferencingFks, tableRowCounts, unindexedForeignKeys, withClient } from './catalog';
import { expectedCounts, pinProblems, selectedMeetings } from './expected-counts';
import { ForeignKey, orphanForeignKeys, parseForeignKeyStatement } from './foreign-keys';
import { greenmaskConfigYaml, meetingSetSql, SubsetSpec } from './greenmask-config';
import { Manifest, writeManifest, MANIFEST_FILE } from './manifest';
import { applyRules } from './masking';
import { buildNormalization, dropPgSyncSql, nullOrphanColumnsSql, temporaryIndexSql } from './normalize';
import { binary, logToStderr, prismaMigrate, psql, redactUrl, run, SUPERUSER_PSQL_ENV, tailLines } from './process';
import { ContentFilter } from './stream-filter';
import { allowedTables, knownTables, loadPinnedMeetings, loadTablesConfig, privateTables, MIGRATIONS_TABLE, PINNED_FILE, TABLES_JSON } from './tables';
import { withScratchCluster } from './transient-postgres';
import { assertLocalTarget, parseLocalTarget } from '@/lib/seed/target-guard';
import { errorMessage } from '@/lib/utils/errors';

export type ProduceOptions = {
    backupPath: string;
    outDir: string;
    workDir: string;
    schemaPath: string;
    meetingsPerBody: number;
    tablesFile?: string;
    pinsFile?: string;
    scratchUrl?: string;
    keepScratch?: boolean;
    /** True when `workDir` outlives the run, so a failure message can name a log file inside it. */
    workDirKept?: boolean;
    log?: (line: string) => void;
};

/** psql messages the filtered restore is allowed to print: roles and extensions the backup names but a scratch cluster lacks. */
const HARMLESS_RESTORE_ERRORS = [/role "[^"]+" does not exist/, /aiven_extras/, /extension "vector"/];

/** The constraint name in a psql foreign-key violation message. */
const FK_VIOLATION = /violates foreign key constraint "([^"]+)"/;

const ARTIFACT_NAMES = ['full.tar.zst', 'subset.tar.zst'];

/** The upper limit of unexpected restore errors that the thrown message quotes. */
const MAX_REPORTED_ERRORS = 20;

/** Stream the backup through the content filter into psql. Returns psql's stderr. */
async function filteredRestore(backupPath: string, scratchUrl: string, filter: ContentFilter): Promise<string> {
    // unexpectedRestoreErrors() below matches "ERROR:" in this stderr, so it needs
    // English messages. This connects as the scratch cluster's owner, a superuser,
    // so it can set lc_messages, unlike the other psql callers in process.ts.
    const result = await run(binary('psql'), ['-X', '-q', '-d', scratchUrl], {
        env: SUPERUSER_PSQL_ENV,
        // Larger chunks halve the time of gunzip, and the filter does less work per byte.
        pipeFrom: [fs.createReadStream(backupPath), zlib.createGunzip({ chunkSize: 1024 * 1024 }), filter],
    });
    return result.stderr;
}

/**
 * The restore adds every foreign key of the backup. A key that points at a table
 * the filter dropped fails, and that failure is expected. A violation of any
 * other constraint means the data is wrong, so it stays in the unexpected set.
 */
function unexpectedRestoreErrors(stderr: string, orphans: ForeignKey[]): string[] {
    const orphanNames = new Set(orphans.map((fk) => fk.constraint));
    return stderr.split('\n')
        .filter((l) => l.includes('ERROR:'))
        .filter((l) => !HARMLESS_RESTORE_ERRORS.some((re) => re.test(l)))
        .filter((l) => {
            const match = FK_VIOLATION.exec(l);
            return match === null || !orphanNames.has(match[1]);
        });
}

/**
 * Run one Greenmask dump. `run` keeps the whole output in memory. The output of a
 * debug run is large, so the run also writes it to a log file in the work
 * directory. The caller can remove an automatic work directory before it prints
 * the error, so a failure message quotes the end of the log. It names the file
 * only when the work directory outlives the run.
 */
async function runGreenmaskDump(o: { configPath: string; logFile: string; password: string; workDirKept: boolean; log: (line: string) => void }): Promise<void> {
    const env = o.password ? { PGPASSWORD: o.password } : {};
    const result = await run('greenmask', ['--config', o.configPath, 'dump'], { env, allowFailure: true });
    const output = result.stdout + result.stderr;
    fs.writeFileSync(o.logFile, output);
    if (o.workDirKept) o.log(`greenmask log: ${o.logFile}`);
    if (result.code !== 0) {
        const where = o.workDirKept ? `\nfull log: ${o.logFile}` : '';
        throw new Error(`greenmask dump failed with exit ${result.code}. The end of its output:\n${tailLines(output)}${where}`);
    }
}

/** The file that keeps a second `produce` out of an output directory while one run writes it. */
export const PRODUCE_LOCK_FILE = '.produce.lock';

function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM: the process runs, but as another user.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
}

/**
 * Take the output directory for this run, and return the function that gives it
 * back. A second run into the same directory would replace the first run's
 * archives while it packs, hashes, or renames them. A lock whose process no
 * longer runs was left by a crash, so it is taken over.
 */
function lockOutDir(outDir: string): () => void {
    const file = path.join(outDir, PRODUCE_LOCK_FILE);
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
            return () => {
                if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === String(process.pid)) fs.rmSync(file);
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            const holder = Number(fs.readFileSync(file, 'utf8'));
            if (Number.isInteger(holder) && holder > 0 && isRunning(holder)) {
                throw new Error(`another produce run (pid ${holder}) writes to ${outDir}. Wait for it to finish, or remove ${file} if that process is not a produce run.`);
            }
            fs.rmSync(file, { force: true });
        }
    }
    throw new Error(`could not take ${file}`);
}

export async function produce(o: ProduceOptions): Promise<Manifest> {
    // A caller supplies the scratch database. Check it before the run starts anything.
    if (o.scratchUrl) assertLocalTarget(o.scratchUrl);
    fs.mkdirSync(o.outDir, { recursive: true });
    const unlock = lockOutDir(o.outDir);
    try {
        return await produceInLockedDir(o);
    } finally {
        unlock();
    }
}

async function produceInLockedDir(o: ProduceOptions): Promise<Manifest> {
    // A run that fails part of the way leaves the artifacts of the previous run in
    // place. Remove the manifest before anything can fail, so no manifest
    // describes files it does not match.
    fs.mkdirSync(o.outDir, { recursive: true });
    fs.rmSync(path.join(o.outDir, MANIFEST_FILE), { force: true });
    // Each line names the seconds since the start, so a log shows where a run spends its time.
    const started = Date.now();
    const sink = o.log ?? logToStderr;
    const log = (line: string) => sink(`[${Math.round((Date.now() - started) / 1000)}s] ${line}`);
    // Each archive is written under a temporary name and renamed when both are
    // complete, so a failed run never leaves a half-written or mismatched archive.
    const partial = (name: string) => path.join(o.outDir, `.${name}.${process.pid}.partial`);
    const workDirKept = o.workDirKept ?? false;
    const cfg = loadTablesConfig(o.tablesFile ?? TABLES_JSON);
    const pinsFile = o.pinsFile ?? PINNED_FILE;
    const pins = loadPinnedMeetings(pinsFile);
    const spec: SubsetSpec = { pins, meetingsPerBody: o.meetingsPerBody, asOf: new Date() };
    const allow = allowedTables(cfg);
    const known = knownTables(cfg);
    const privates = privateTables(cfg);
    fs.mkdirSync(o.workDir, { recursive: true });
    // Greenmask's configs, dump storage, and logs of this run. Another run can use the
    // same work directory, and newestDumpDir() would otherwise pick its dump.
    const runDir = fs.mkdtempSync(path.join(o.workDir, 'run-'));

    // A caller-supplied `--scratch-url` names a database that `produce` does not
    // own: it is asserted above and never stopped. Otherwise a transient cluster
    // holds scratch, and `keepScratch` keeps it.
    const withScratch = (body: (scratchUrl: string) => Promise<Manifest>): Promise<Manifest> => o.scratchUrl
        ? body(o.scratchUrl)
        : withScratchCluster({ workDir: o.workDir, workDirKept, keep: o.keepScratch, log }, async (cluster) => {
            await cluster.createDatabase('scratch');
            return body(cluster.url('scratch'));
        });

    return withScratch(async (scratchUrl) => {
        log(`scratch database: ${redactUrl(scratchUrl)}`);
        const { password: scratchPassword, ...conn } = parseLocalTarget(scratchUrl);

        // 1. Fetch and filter.
        log(`restoring ${o.backupPath} into scratch with private tables filtered out`);
        const filter = new ContentFilter({ allow, known });
        const stderr = await filteredRestore(o.backupPath, scratchUrl, filter);
        const captured = filter.stats.foreignKeyStatements.map(parseForeignKeyStatement).flatMap((fk) => (fk ? [fk] : []));
        const orphans = orphanForeignKeys(captured, allow);
        // A backup in another format produces no COPY block that the filter keeps.
        // Every later count then reads as an empty database instead of a failure.
        const keptContent = Object.keys(filter.stats.kept).filter((table) => table !== MIGRATIONS_TABLE);
        if (keptContent.length === 0) throw new Error('the filter matched no COPY block; check the backup format');
        const unexpected = unexpectedRestoreErrors(stderr, orphans);
        if (unexpected.length) {
            const shown = unexpected.slice(0, MAX_REPORTED_ERRORS);
            throw new Error(`filtered restore reported ${unexpected.length} errors outside the allowed set; the first ${shown.length}:\n${shown.join('\n')}`);
        }
        log(`dropped rows: ${Object.entries(filter.stats.dropped).map(([t, n]) => `${t}=${n}`).join(' ')}`);

        // 2. Assert privacy, stage one.
        await withClient(scratchUrl, async (client) => {
            const tables = await listTables(client);
            // The assertion covers the private tables that scratch holds. A private
            // table that scratch does not hold can leak nothing, so it is skipped.
            const mustBeEmpty = tables.filter((t) => privates.includes(t) || (t.startsWith('_') && t !== MIGRATIONS_TABLE));
            const counts = await tableRowCounts(client, mustBeEmpty);
            const leaked = Object.entries(counts).filter(([, n]) => n > 0);
            if (leaked.length) throw new Error(`private tables hold rows after the filtered restore: ${leaked.map(([t, n]) => `${t}=${n}`).join(', ')}`);
            log(`privacy stage one: ${mustBeEmpty.length} tables asserted empty`);

            // A pin bypasses the content window, so a pinned meeting can lack the
            // content that `verify` requires. Stop here, before the long dumps.
            const problems = await pinProblems(client, pins);
            if (problems.length) throw new Error(`pinned meetings that verify would reject (${pinsFile}):\n${problems.join('\n')}`);
        });

        // 3. Remove the rows that only a column pointing at a private table marks as
        // private, then null those columns and repair the keys the restore skipped,
        // so scratch holds production's schema.
        await psql(scratchUrl, applyRules(cfg.beforeNulling).join('\n'));
        await psql(scratchUrl, nullOrphanColumnsSql(orphans).join('\n'));
        await withClient(scratchUrl, async (client) => {
            for (const fk of captured) {
                if (await constraintExists(client, fk.constraint)) continue;
                try {
                    await client.query(fk.statement);
                } catch (error) {
                    throw new Error(`re-adding foreign key "${fk.constraint}" on public."${fk.table}" failed: ${errorMessage(error)}`, { cause: error });
                }
            }
        });

        // 4. Rehearse migrations on production's schema, before the normalisation
        // changes any key: a pending migration can drop or alter a key by name. A
        // pending migration can also create a table that the classification does not
        // name. The privacy scan of `verify` reads the content of every such table.
        log('rehearsing prisma migrate deploy');
        await prismaMigrate(scratchUrl, o.schemaPath, ['deploy']);

        // 5. Derive the normalisation from the migrated catalog, which the dumps read.
        const normalization = await withClient(scratchUrl, async (client) => {
            const fks = await listForeignKeys(client);
            const derived = buildNormalization({
                misordered: misorderedCompositeFks(fks),
                selfReferencing: selfReferencingFks(fks),
                explicitQueryFks: fksOfTables(fks, cfg.explicitQuery),
            });
            log(`normalisation: ${derived.sql.length} statements, ${derived.postRestoreSql.length} re-added after restore`);
            return derived;
        });
        await psql(scratchUrl, normalization.sql.join('\n'));

        // Drop PGSync's change capture after the rehearsal, so the rehearsal runs
        // with the same triggers as production. No consumer of the artifacts runs
        // PGSync, and a dump carries its view without data, so writes would fail.
        await withClient(scratchUrl, async (client) => {
            const pgSync = await listPgSyncObjects(client);
            for (const statement of dropPgSyncSql(pgSync)) await client.query(statement);
            log(`pgsync objects dropped: ${pgSync.triggers.length} triggers, ${pgSync.hasFunction ? 1 : 0} functions, ${pgSync.hasView ? 1 : 0} materialized views`);
        });

        // 6. Full artifact: masking applied, no subset. Production lacks an index on some
        // foreign keys, and a delete-when cascade then scans their tables once per deleted
        // row. Temporary indexes exist only while the rules run; a failure stops the run.
        const indexes = await withClient(scratchUrl, async (client) => temporaryIndexSql(unindexedForeignKeys(await listForeignKeys(client), await listIndexColumns(client))));
        log(`applying the masking rules, with ${indexes.create.length} temporary foreign-key indexes`);
        await psql(scratchUrl, [...indexes.create, ...applyRules(cfg.masking), ...indexes.drop].join('\n'));
        const base = { conn, tmpDir: path.join(runDir, 'gm-tmp'), pgBinPath: process.env.SEED_PG_BIN, privateTables: privates, ignoreTables: cfg.ignoreTables, explicitQuery: cfg.explicitQuery };
        const fullStorage = path.join(runDir, 'storage-full');
        fs.mkdirSync(fullStorage, { recursive: true });
        fs.mkdirSync(base.tmpDir, { recursive: true });
        const fullConfig = path.join(runDir, 'greenmask-full.yml');
        fs.writeFileSync(fullConfig, greenmaskConfigYaml({ ...base, storageDir: fullStorage }));
        log('dumping the full artifact');
        await runGreenmaskDump({ configPath: fullConfig, logFile: path.join(runDir, 'greenmask-full.log'), password: scratchPassword, workDirKept, log });
        log('packing the full artifact');
        const full = await packArtifact({ dumpDir: newestDumpDir(fullStorage), postRestoreSql: normalization.postRestoreSql, outFile: partial('full.tar.zst') });

        // 7. Subset artifact: subset-only masking, then the conditioned dump.
        // The full dump is written, and the subset dump reads only the tasks of the
        // selected meetings, so the subset-only rules leave the other tasks alone.
        log('applying the subset-only rules');
        const subsetScope = { TaskStatus: `("cityId", "councilMeetingId") IN (${meetingSetSql(spec)})` };
        await psql(scratchUrl, applyRules(cfg.subsetOnly, subsetScope).join('\n'));
        const subsetStorage = path.join(runDir, 'storage-subset');
        fs.mkdirSync(subsetStorage, { recursive: true });
        const subsetConfig = path.join(runDir, 'greenmask-subset.yml');
        // The subset conditions are the part that can drop a row by mistake. The
        // debug log names the query of each table, so it diagnoses a dropped row.
        fs.writeFileSync(subsetConfig, greenmaskConfigYaml({ ...base, storageDir: subsetStorage, subset: spec, debug: true }));
        log('dumping the subset artifact');
        await runGreenmaskDump({ configPath: subsetConfig, logFile: path.join(runDir, 'greenmask-subset.log'), password: scratchPassword, workDirKept, log });
        log('packing the subset artifact');
        const subset = await packArtifact({ dumpDir: newestDumpDir(subsetStorage), postRestoreSql: normalization.postRestoreSql, outFile: partial('subset.tar.zst') });

        // 8. Manifest with the expected counts computed independently in scratch.
        const greenmaskVersion = (await run('greenmask', ['--version'])).stdout.trim();
        const manifest = await withClient(scratchUrl, async (client) => {
            const meetings = await selectedMeetings(client, spec);
            const counts = await expectedCounts(client, meetings);
            for (const table of privates) counts[table] = 0;
            const { rows } = await client.query<{ id: string }>("SELECT id FROM public.\"City\" WHERE status = 'supported' ORDER BY 1");
            const m: Manifest = {
                producedAt: new Date().toISOString(),
                backup: { path: o.backupPath, date: fs.statSync(o.backupPath).mtime.toISOString() },
                migrationHead: await migrationHead(client),
                greenmaskVersion,
                meetingsPerBody: o.meetingsPerBody,
                // `cities` lists the supported cities. `counts.City` counts every city row.
                cities: rows.map((r) => r.id),
                meetings,
                counts,
                files: { subset: { name: 'subset.tar.zst', ...subset }, full: { name: 'full.tar.zst', ...full } },
            };
            return m;
        });
        // The manifest goes last: an artifact without one belongs to no finished run.
        for (const name of ARTIFACT_NAMES) fs.renameSync(partial(name), path.join(o.outDir, name));
        writeManifest(o.outDir, manifest);
        log(`wrote ${o.outDir}/manifest.json: ${manifest.meetings.length} meetings, subset ${subset.bytes} bytes, full ${full.bytes} bytes`);
        return manifest;
    });
}
