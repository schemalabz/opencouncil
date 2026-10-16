import fs from 'fs';
import path from 'path';
import type { Client } from 'pg';
import { sha256File } from './artifact';
import { listTables, primaryKeyColumns, tableRowCounts, withClient } from './catalog';
import { FileInfo, Manifest, readManifest } from './manifest';
import { maskingCheckSql } from './masking';
import { quoteIdent } from './normalize';
import { logToStderr, prismaMigrate, redactUrl } from './process';
import { scanDumpDir, ScanReport } from './privacy-scan';
import { contentTables, loadTablesConfig, privateTables, TablesConfig, TABLES_JSON } from './tables';
import { withScratchCluster } from './transient-postgres';
import { restoreArtifact } from '@/lib/seed/restore';
import { assertLocalTarget } from '@/lib/seed/target-guard';
import { errorMessage, formatError } from '@/lib/utils/errors';

export type ArtifactKind = 'subset' | 'full';

export type VerifyOptions = {
    outDir: string;
    workDir: string;
    schemaPath: string;
    tablesFile?: string;
    /** Empty local databases to restore into, instead of a transient cluster. */
    verifyUrls?: Record<ArtifactKind, string>;
    /** True when `workDir` outlives the run, so a failure message can name a log file inside it. */
    workDirKept?: boolean;
    log?: (line: string) => void;
};

export type VerifyReport = {
    ok: boolean;
    /** The manifest's record of the artifacts this report checked, so a report cannot pass for other artifacts. */
    artifacts: { producedAt: string; subsetSha256: string; fullSha256: string };
    failures: string[];
    /** The subset's row counts that differ from the manifest. */
    countDiffs: Record<string, { expected: number; actual: number }>;
    /** Absent when the run stopped before the privacy scan. */
    scans?: { subset: ScanReport; full: ScanReport };
};

export const VERIFY_REPORT_FILE = 'verify-report.json';

function writeReport(outDir: string, report: VerifyReport, log: (line: string) => void): void {
    const file = path.join(outDir, VERIFY_REPORT_FILE);
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    log(`wrote ${file}`);
}

/** Compare one artifact file against the size and the checksum the manifest records. */
export async function fileFailures(outDir: string, info: FileInfo): Promise<string[]> {
    const file = path.join(outDir, info.name);
    if (!fs.existsSync(file)) return [`${info.name} is missing from ${outDir}`];
    const failures: string[] = [];
    const bytes = fs.statSync(file).size;
    if (bytes !== info.bytes) failures.push(`${info.name}: the manifest records ${info.bytes} bytes, the file has ${bytes}`);
    const sha256 = await sha256File(file);
    if (sha256 !== info.sha256) failures.push(`${info.name}: the manifest records sha256 ${info.sha256}, the file has ${sha256}`);
    return failures;
}

/** An update of one row that changes no value. It fires the row triggers and the rules of the table. */
export function noOpUpdateSql(table: string, column: string): string {
    const target = `public.${quoteIdent(table)}`;
    const col = quoteIdent(column);
    return `UPDATE ${target} SET ${col} = ${col} WHERE ctid = (SELECT ctid FROM ${target} LIMIT 1)`;
}

/**
 * A trigger or a rule can break on a copy of the database, for example one that
 * reads an object the artifact does not populate. Then every write on the table
 * fails. One no-op update per table, always rolled back, finds such a table.
 */
async function writeCheckFailures(client: Client, tables: string[]): Promise<string[]> {
    const primaryKeys = await primaryKeyColumns(client);
    const failures: string[] = [];
    for (const table of tables) {
        // The update names the first primary-key column. A table without a
        // primary key has no such column, so the check skips it.
        const column = primaryKeys[table];
        if (column === undefined) continue;
        await client.query('BEGIN');
        try {
            await client.query(noOpUpdateSql(table, column));
        } catch (error: unknown) {
            failures.push(`a write on ${table} fails: ${errorMessage(error)}`);
        } finally {
            await client.query('ROLLBACK');
        }
    }
    return failures;
}

/** The subset's own checks: row counts against the manifest, and the selected meetings. */
async function subsetFailures(client: Client, manifest: Manifest, actual: Record<string, number>, schemaTables: Set<string>, countDiffs: VerifyReport['countDiffs']): Promise<string[]> {
    const failures: string[] = [];
    for (const [table, expected] of Object.entries(manifest.counts)) {
        if (!schemaTables.has(table) || actual[table] === expected) continue;
        countDiffs[table] = { expected, actual: actual[table] };
        failures.push(`row count for ${table}: expected ${expected}, got ${actual[table]}`);
    }

    // Every selected meeting is present, and every present meeting has content.
    const { rows } = await client.query<{ cityId: string; id: string; hasContent: boolean }>(`
        SELECT m."cityId", m.id,
               EXISTS (SELECT 1 FROM public."Subject" s WHERE (s."cityId", s."councilMeetingId") = (m."cityId", m.id))
           AND EXISTS (SELECT 1 FROM public."SpeakerSegment" g WHERE (g."cityId", g."meetingId") = (m."cityId", m.id)) AS "hasContent"
          FROM public."CouncilMeeting" m`);
    const empty = rows.filter((r) => !r.hasContent);
    if (empty.length) failures.push(`meetings without a subject or a segment: ${empty.map((r) => `${r.cityId}/${r.id}`).join(', ')}`);
    const restored = new Set(rows.map((r) => `${r.cityId}/${r.id}`));
    for (const meeting of manifest.meetings) {
        const key = `${meeting.cityId}/${meeting.meetingId}`;
        if (!restored.has(key)) failures.push(`manifest meeting ${key} is not in the subset`);
    }
    return failures;
}

/**
 * Restore one artifact with foreign keys enforced into an empty database, and
 * check it. Both artifacts get the checks that hold for any copy: a clean
 * migration status, private tables at zero, a write on every table with rows,
 * and the masking rules. The subset also gets its counts, its meetings, and the
 * subset-only rules. The full artifact holds the old rows the subset leaves out,
 * so only its own check sees a row shape that a masking rule misses.
 * Returns the failures, and the unpacked dump directory for the privacy scan.
 */
async function checkArtifact(kind: ArtifactKind, o: { url: string; outDir: string; workDir: string; schemaPath: string; cfg: TablesConfig; manifest: Manifest; countDiffs: VerifyReport['countDiffs']; log: (line: string) => void }): Promise<{ failures: string[]; dumpDir: string }> {
    const failures: string[] = [];
    const restoreDir = path.join(o.workDir, kind);
    o.log(`restoring the ${kind} artifact into ${redactUrl(o.url)}`);
    await restoreArtifact({ tarPath: path.join(o.outDir, o.manifest.files[kind].name), databaseUrl: o.url, schemaPath: o.schemaPath, workDir: restoreDir });
    // Prisma 5.22 returns "Database schema is up to date!" on stdout, and exits
    // non-zero on every other state. `allowFailure` keeps that output readable.
    // Prisma writes the reason of an unclean state to stderr. Report both streams.
    const status = await prismaMigrate(o.url, o.schemaPath, ['status'], { allowFailure: true });
    if (status.code !== 0 || !/up to date/i.test(status.stdout)) {
        failures.push(`prisma migrate status is not clean (exit ${status.code}):\n${status.stdout}\n${status.stderr}`);
    }

    o.log(`checking the ${kind} artifact: counts, writes, masking rules`);
    await withClient(o.url, async (client) => {
        // A count of a table the restored schema does not have raises a bare
        // Postgres error, so the names are compared against the catalog first.
        const schemaTables = new Set(await listTables(client));
        const classified = kind === 'subset' ? Object.keys(o.manifest.counts) : [...contentTables(o.cfg), ...privateTables(o.cfg)];
        const missingTables = classified.filter((table) => !schemaTables.has(table));
        for (const table of missingTables) failures.push(`table ${table} is not in the restored schema`);
        const actual = await tableRowCounts(client, classified.filter((table) => schemaTables.has(table)));
        for (const table of privateTables(o.cfg)) {
            if (missingTables.includes(table)) continue;
            // An absent count must never read as an empty table.
            const rows = actual[table];
            if (rows === undefined) failures.push(`private table ${table} is missing from the manifest counts`);
            else if (rows !== 0) failures.push(`private table ${table} holds ${rows} rows`);
        }

        // Every counted table with a row takes a write. A table outside the
        // classification, such as the spatial_ref_sys table of PostGIS, is not checked.
        failures.push(...await writeCheckFailures(client, Object.keys(actual).filter((table) => actual[table] > 0)));

        if (kind === 'subset') failures.push(...await subsetFailures(client, o.manifest, actual, schemaTables, o.countDiffs));

        // A rule against a column the schema lacks fails the query, so each check names its own rule.
        for (const rule of kind === 'subset' ? [...o.cfg.masking, ...o.cfg.subsetOnly] : o.cfg.masking) {
            const name = `masking rule ${rule.table}${'column' in rule ? `.${rule.column}` : ''} (${rule.action})`;
            try {
                const { rows: r } = await client.query<{ n: string }>(maskingCheckSql(rule));
                if (r[0].n !== '0') failures.push(`${name} leaves ${r[0].n} rows unmasked`);
            } catch (error: unknown) {
                failures.push(`${name} could not be checked: ${errorMessage(error)}`);
            }
        }
    });
    return { failures: failures.map((failure) => `${kind}: ${failure}`), dumpDir: path.join(restoreDir, 'artifact') };
}

/**
 * Restore both artifacts into throwaway databases and check them against the
 * manifest and the classification. `verify` never produces an artifact. It
 * reads the artifacts of `outDir`.
 */
export async function verify(o: VerifyOptions): Promise<VerifyReport> {
    // A report of an earlier run must not outlive a run that fails, so it goes first.
    fs.rmSync(path.join(o.outDir, VERIFY_REPORT_FILE), { force: true });
    // A caller supplies the verify databases. Check them before the run starts anything.
    for (const url of Object.values(o.verifyUrls ?? {})) assertLocalTarget(url);
    const log = o.log ?? logToStderr;
    const cfg = loadTablesConfig(o.tablesFile ?? TABLES_JSON);
    const manifest = readManifest(o.outDir);
    const artifacts: VerifyReport['artifacts'] = {
        producedAt: manifest.producedAt,
        subsetSha256: manifest.files.subset.sha256,
        fullSha256: manifest.files.full.sha256,
    };
    const publicText = new Set(cfg.publicText);
    const failures: string[] = [];
    const countDiffs: VerifyReport['countDiffs'] = {};
    fs.mkdirSync(o.workDir, { recursive: true });

    // A file that does not match the manifest belongs to another run. The counts of
    // the manifest then describe other data, so the restore never starts.
    failures.push(...await fileFailures(o.outDir, manifest.files.subset));
    failures.push(...await fileFailures(o.outDir, manifest.files.full));
    if (failures.length) {
        writeReport(o.outDir, { ok: false, artifacts, failures, countDiffs }, log);
        throw new Error(`verification failed:\n- ${failures.join('\n- ')}`);
    }

    let scans: VerifyReport['scans'];
    let reportWritten = false;
    const check = async (urls: Record<ArtifactKind, string>): Promise<VerifyReport> => {
        const common = { outDir: o.outDir, workDir: o.workDir, schemaPath: o.schemaPath, cfg, manifest, countDiffs, log };
        const subset = await checkArtifact('subset', { ...common, url: urls.subset });
        const full = await checkArtifact('full', { ...common, url: urls.full });
        failures.push(...subset.failures, ...full.failures);

        log('scanning both artifacts for email-like and phone-like strings');
        scans = { subset: await scanDumpDir(subset.dumpDir, publicText), full: await scanDumpDir(full.dumpDir, publicText) };
        for (const [name, scan] of Object.entries(scans)) {
            if (scan.violations.length) failures.push(`${name}: email-like or phone-like strings in ${scan.violations.join(', ')}`);
        }

        const report: VerifyReport = { ok: failures.length === 0, artifacts, failures, countDiffs, scans };
        writeReport(o.outDir, report, log);
        reportWritten = true;
        if (!report.ok) throw new Error(`verification failed:\n- ${failures.join('\n- ')}`);
        log('verification passed');
        return report;
    };

    try {
        if (o.verifyUrls) return await check(o.verifyUrls);
        return await withScratchCluster({ workDir: o.workDir, workDirKept: o.workDirKept, log }, async (cluster) => {
            for (const kind of ['subset', 'full'] as const) await cluster.createDatabase(`verify_${kind}`);
            return check({ subset: cluster.url('verify_subset'), full: cluster.url('verify_full') });
        });
    } catch (error) {
        // A step that throws (a restore, a query, the scan) still leaves a report:
        // the failures so far, plus the error that stopped the run.
        if (!reportWritten) {
            writeReport(o.outDir, { ok: false, artifacts, failures: [...failures, formatError(error)], countDiffs, scans }, log);
        }
        throw error;
    }
}
