import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { assertLocalTarget } from './target-guard';
import { fileFailures, POST_RESTORE_FILE, unpackArtifact } from './artifact';
import { withClient } from './catalog';
import { MANIFEST_FILE, readManifest } from './manifest';
import { binary, childEnv, prismaMigrate, run, tailLines } from './process';

export type RestoreOptions = {
    tarPath: string;
    databaseUrl: string;
    /** prisma/schema.prisma of the checkout or of the packaged pipeline. */
    schemaPath: string;
    workDir: string;
    /** Host names that the caller knows are local; see parseLocalTarget. */
    trustedHosts?: readonly string[];
    /**
     * Replace the objects in public (not the extensions; see REPLACE_SQL), inside the
     * transaction of the restore. A failed restore keeps the data it would have
     * replaced. `prisma migrate deploy` runs after the commit, so a branch migration
     * that fails leaves the artifact in place, and deployMigrations names the way
     * out. Without `replace`, a database with tables is refused.
     */
    replace?: boolean;
};

/**
 * The objects in public that no extension owns, each with the statement that drops
 * it: relations first, then types, then routines. assertEmptyDatabase counts them,
 * and `replace` drops exactly them, so "empty" and "what replace clears" agree.
 * PostGIS owns spatial_ref_sys and its types and functions, and
 * `nix run .#dev --fast` creates PostGIS before anything else, so those do not
 * make a database non-empty.
 */
const USER_OBJECTS_SQL = `
    SELECT 1 AS step, format('DROP %s IF EXISTS public.%I CASCADE',
        CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE'
                       WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END, c.relname) AS drop_statement
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
    UNION ALL
    SELECT 2, format('DROP %s IF EXISTS public.%I CASCADE', CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, t.typname)
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace LEFT JOIN pg_class c ON c.oid = t.typrelid
    WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'r', 'c') AND (t.typrelid = 0 OR c.relkind = 'c')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass AND d.objid = t.oid AND d.deptype = 'e')
    UNION ALL
    SELECT 3, format('DROP %s IF EXISTS %s CASCADE', CASE p.prokind WHEN 'a' THEN 'AGGREGATE' ELSE 'ROUTINE' END, p.oid::regprocedure)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`;

/**
 * A restore into a database with user objects fails on its first CREATE. Refuse before it
 * starts, and point at `reset`, which replaces the data.
 */
export async function assertEmptyDatabase(databaseUrl: string): Promise<void> {
    const n = await withClient(databaseUrl, async (client) =>
        (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${USER_OBJECTS_SQL}) o`)).rows[0].n);
    if (n > 0) throw new Error(`the database already has ${n} tables, views, types, or routines in public; \`npm run seed -- reset\` replaces it with the artifact`);
}

/**
 * The checkout must have every migration that the artifact has. Otherwise
 * `prisma migrate deploy` finds a migration in the database that it does not
 * know, and the app's client does not match the tables.
 */
export function assertCheckoutHasMigrations(tarPath: string, schemaPath: string): void {
    const missing = migrationMissingFromCheckout(tarPath, schemaPath);
    if (missing) throw new Error(`the artifact has the migration ${missing}, which this checkout does not have. Pull main, or restore an older artifact with --from`);
}

/** The newest migration of the artifact when the checkout does not have it, else null. */
export function migrationMissingFromCheckout(tarPath: string, schemaPath: string): string | null {
    const manifestDir = path.dirname(tarPath);
    if (!fs.existsSync(path.join(manifestDir, MANIFEST_FILE))) return null;
    const head = readManifest(manifestDir).migrationHead;
    return head && !fs.existsSync(path.join(path.dirname(schemaPath), 'migrations', head)) ? head : null;
}

/**
 * Drop the user objects in public (USER_OBJECTS_SQL), so the dump restores into an
 * empty schema. The extensions stay: in a native setup a superuser often installs
 * PostGIS, and the app role cannot create it again. The dump's
 * `CREATE EXTENSION IF NOT EXISTS` then changes nothing.
 */
const REPLACE_SQL = `DO $replace$
DECLARE r record;
BEGIN
    -- Qualified names in the regprocedure output.
    PERFORM set_config('search_path', 'pg_catalog', true);
    FOR r IN ${USER_OBJECTS_SQL}
        ORDER BY step
    LOOP
        EXECUTE r.drop_statement;
    END LOOP;
END
$replace$;
`;

/**
 * `prisma migrate deploy` for the checkout. Prisma records a migration that fails
 * and refuses every later deploy (P3009) until someone resolves it, so a second
 * run alone does not help: the error says what does.
 */
export async function deployMigrations(databaseUrl: string, schemaPath: string): Promise<void> {
    try {
        await prismaMigrate(databaseUrl, schemaPath, ['deploy']);
    } catch (error) {
        throw new Error(
            'prisma migrate deploy failed. When a migration failed, Prisma refuses every later run until it is resolved: ' +
                '`npm run seed -- reset` starts again from the artifact, or fix the migration and run ' +
                '`npx prisma migrate resolve --rolled-back <migration>` before the next run',
            { cause: error },
        );
    }
}

/**
 * The one consumer flow: an empty database (or one that `replace` empties in the
 * same transaction), the artifact's schema and data,
 * the constraints the dump cannot carry, then `prisma migrate deploy`, which is
 * a no-op on main and applies only a branch's own migrations. Returns the
 * directory that holds the unpacked dump.
 *
 * Each restore unpacks into its own directory in `workDir`, so two restores that
 * share a work directory cannot replace the files that the other one reads.
 */
export async function restoreArtifact(o: RestoreOptions): Promise<string> {
    assertLocalTarget(o.databaseUrl, o.trustedHosts);
    fs.mkdirSync(o.workDir, { recursive: true });
    const dir = await unpackArtifact(o.tarPath, fs.mkdtempSync(path.join(o.workDir, 'artifact-')));
    if (!o.replace) await assertEmptyDatabase(o.databaseUrl);
    await restoreInOneTransaction(o.databaseUrl, dir, { replace: o.replace, trustedHosts: o.trustedHosts });
    await deployMigrations(o.databaseUrl, o.schemaPath);
    return dir;
}

/**
 * pg_restore writes the dump as SQL, and psql runs it and post-restore.sql between
 * one BEGIN and one COMMIT. A failure of pg_restore or of any statement leaves the
 * database as it was, so a later run never finds one that is half restored and
 * takes it for a set-up database. With `replace`, the drop of the old data runs
 * in the same transaction, so a failure keeps the old data.
 *
 * Without comments: the dump comments on its extensions, which only the role that
 * created them may do, and a developer's role often did not. The migrations create
 * no comment.
 *
 * A dump with large objects is refused: pg_restore wraps them in a BEGIN and a
 * COMMIT of its own, and that COMMIT would end this transaction early. The
 * artifacts hold none.
 */
export async function restoreInOneTransaction(databaseUrl: string, dumpDir: string, o: { replace?: boolean; trustedHosts?: readonly string[] } = {}): Promise<void> {
    if (o.replace) assertLocalTarget(databaseUrl, o.trustedHosts);
    const toc = (await run(binary('pg_restore'), ['-l', dumpDir])).stdout;
    if (/^[^;].*\s(BLOBS?|BLOB METADATA)\s/m.test(toc)) {
        throw new Error(`${dumpDir} holds large objects, which the restore cannot load in one transaction`);
    }
    const restore = spawn(binary('pg_restore'), ['--no-owner', '--no-privileges', '--no-comments', '-f', '-', dumpDir], { env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    restore.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    const exited = new Promise<number>((resolve, reject) => {
        restore.on('error', reject);
        restore.on('close', (code) => resolve(code ?? -1));
    });
    const failure = (code: number, cause?: unknown) => {
        const how = restore.signalCode ? `signal ${restore.signalCode}` : `exit ${code}`;
        return new Error(`pg_restore failed with ${how}${stderr ? `\n${tailLines(stderr)}` : ''}`, { cause });
    };
    async function* script(): AsyncGenerator<string | Buffer> {
        yield 'BEGIN;\n';
        if (o.replace) yield REPLACE_SQL;
        yield* restore.stdout;
        const code = await exited;
        // psql then reaches the end of its input without a COMMIT, and the server rolls back.
        if (code !== 0) throw failure(code);
        // The dump empties search_path, and post-restore.sql names its tables without a schema.
        yield 'RESET search_path;\n';
        yield* fs.createReadStream(path.join(dumpDir, POST_RESTORE_FILE));
        yield '\nCOMMIT;\n';
    }
    try {
        await run(binary('psql'), ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-o', '/dev/null', '-d', databaseUrl], { pipeFrom: [Readable.from(script())] });
    } catch (error) {
        // psql can stop on a script that pg_restore cut short. Its cause is pg_restore's error.
        if (restore.exitCode !== null && restore.exitCode !== 0) throw failure(restore.exitCode, error);
        throw error;
    } finally {
        // psql stopped on an error, so nothing reads pg_restore's output any more.
        if (restore.exitCode === null && restore.signalCode === null) restore.kill();
    }
}

/**
 * An archive next to a manifest.json must be the one that manifest records. A
 * file that someone copied in or changed by hand does not match it.
 */
export async function assertMatchesManifest(tarPath: string): Promise<void> {
    const outDir = path.dirname(tarPath);
    if (!fs.existsSync(path.join(outDir, MANIFEST_FILE))) return;
    const info = Object.values(readManifest(outDir).files).find((file) => file.name === path.basename(tarPath));
    if (!info) throw new Error(`${MANIFEST_FILE} in ${outDir} does not record ${path.basename(tarPath)}`);
    const failures = await fileFailures(outDir, info);
    if (failures.length) throw new Error(`${tarPath} does not match ${MANIFEST_FILE}:\n${failures.join('\n')}`);
}

/**
 * Copies the archive and the manifest beside it into a new directory in `workDir`,
 * then checks the copy against its manifest. `produce` and `fetch` never change an
 * archive they published, but `--from` can name any directory. A file that someone
 * replaces or overwrites there after the copy cannot change what the checks read
 * and pg_restore loads; a hard link would share an overwrite. A change between the
 * two copies gives an archive and a manifest that do not match, which the check
 * refuses. The copy is a clone where the file system supports one. Returns the
 * path of the checked archive.
 */
export async function checkedSnapshot(tarPath: string, workDir: string): Promise<string> {
    fs.mkdirSync(workDir, { recursive: true });
    const dir = fs.mkdtempSync(path.join(workDir, 'snapshot-'));
    for (const name of [path.basename(tarPath), MANIFEST_FILE]) {
        const source = path.join(path.dirname(tarPath), name);
        if (name === MANIFEST_FILE && !fs.existsSync(source)) continue;
        fs.copyFileSync(source, path.join(dir, name), fs.constants.COPYFILE_FICLONE);
    }
    const snapshot = path.join(dir, path.basename(tarPath));
    await assertMatchesManifest(snapshot);
    return snapshot;
}

/**
 * The PostgreSQL major version of the client tools that restore an artifact: the
 * version of production and of the Nix and Docker setups. pg_restore 15 cannot
 * read the dump, and pg_restore 17 and 18 send settings that a version 16 server
 * refuses.
 */
export const PG_CLIENT_MAJOR = 16;

async function versionOf(cmd: string): Promise<string | null> {
    try {
        const { stdout } = await run(cmd, ['--version']);
        return stdout.match(/(\d+(?:\.\d+)?)/)?.[1] ?? null;
    } catch {
        // spawn fails when the program is not installed.
        return null;
    }
}

/**
 * Stop with what to install when this machine cannot restore an artifact: the
 * PostgreSQL client tools of PG_CLIENT_MAJOR, and a tar that reads zstd. Alpine's
 * busybox tar has no --zstd.
 */
export async function assertRestoreTools(): Promise<void> {
    const problems: string[] = [];
    for (const tool of ['pg_restore', 'psql']) {
        const version = await versionOf(binary(tool));
        if (version === null) problems.push(`${tool} is not installed`);
        else if (Number.parseInt(version, 10) !== PG_CLIENT_MAJOR) problems.push(`${tool} is version ${version}`);
    }
    if (problems.length) {
        throw new Error(
            `restoring the seed artifact needs the PostgreSQL ${PG_CLIENT_MAJOR} client tools, but ${problems.join(' and ')}. ` +
            `Install them, for example \`apt install postgresql-client-${PG_CLIENT_MAJOR}\` or \`brew install postgresql@${PG_CLIENT_MAJOR}\`, ` +
            'and put their bin directory first on PATH, or set SEED_PG_BIN to it. See docs/database-seeding.md.',
        );
    }
    const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-tools-'));
    try {
        await run('tar', ['--zstd', '-cf', path.join(probe, 'probe.tar.zst'), '-T', '/dev/null']);
    } catch (error) {
        throw new Error('restoring the seed artifact needs a tar that reads zstd: GNU tar with zstd installed, for example `apt install zstd` or `brew install zstd`.', { cause: error });
    } finally {
        fs.rmSync(probe, { recursive: true, force: true });
    }
}

/**
 * Restore an archive that a consumer fetched: check the tools, then a snapshot of
 * the archive against its manifest and against the checkout's migrations, then
 * restore the snapshot from a temporary work directory that is removed afterwards.
 */
export async function restoreArchive(o: Omit<RestoreOptions, 'workDir'> & { log: (line: string) => void }): Promise<void> {
    await assertRestoreTools();
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-restore-'));
    try {
        // Every check runs before the restore writes anything, so a refused archive
        // never costs the data that `replace` would drop.
        const tarPath = await checkedSnapshot(o.tarPath, workDir);
        assertCheckoutHasMigrations(tarPath, o.schemaPath);
        o.log(`${o.replace ? 'replacing the database with' : 'restoring'} ${o.tarPath}`);
        await restoreArtifact({ ...o, tarPath, workDir });
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}
