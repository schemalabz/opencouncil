import yaml from 'js-yaml';
import { Pin } from './tables';
import { quoteIdent } from './normalize';

export type ConnectionInfo = { host: string; port: number; user: string; database: string };
/**
 * `asOf` stands for now() in the meeting window. A run takes it once, so every query
 * of the run selects the same meetings, Greenmask's included, although a meeting
 * date can pass while the run is going.
 */
export type SubsetSpec = { pins: Pin[]; meetingsPerBody: number; asOf: Date };

export type TransformationEntry = {
    schema: 'public';
    name: string;
    subset_conds?: string[];
    query?: string;
};

export type GreenmaskConfig = {
    common: { pg_bin_path?: string; tmp_dir: string };
    log: { level: 'info' | 'debug'; format: 'text' };
    storage: { type: 'directory'; directory: { path: string } };
    dump: {
        pg_dump_options: Record<string, string | number | boolean | string[]>;
        transformation: TransformationEntry[];
    };
};

function pairLiteral(pin: Pin): string {
    return `('${pin.cityId}','${pin.meetingId}')`;
}

/** Quote a libpq conninfo value: `\` and `'` escaped, wrapped in single quotes. */
function quoteConnInfoValue(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * A SELECT of ("cityId", id) pairs: the pinned meetings plus the latest N released
 * meetings per administrative body of every supported city that hold content.
 *
 * The window keeps a past-dated meeting that has at least one subject and at least
 * one speaker segment. Production holds released meetings with a future date, and
 * released past meetings that no one has transcribed yet. Such a meeting has no
 * subject and no speaker segment, so `verify` reports it as an empty meeting and
 * fails. The content tests sit inside the window subquery, so `row_number()` ranks
 * meetings with content only. A pin bypasses the window on purpose, because a pin
 * is explicit.
 */
export function meetingSetSql(spec: SubsetSpec): string {
    const window = `SELECT w."cityId", w.id FROM (
      SELECT m."cityId", m.id, row_number() OVER (PARTITION BY m."cityId", coalesce(m."administrativeBodyId", '(none)') ORDER BY m."dateTime" DESC) AS rn
        FROM public."CouncilMeeting" m JOIN public."City" c ON c.id = m."cityId"
       WHERE m.released AND m."dateTime" <= '${spec.asOf.toISOString()}'::timestamptz AND c.status = 'supported'
         AND EXISTS (SELECT 1 FROM public."Subject" s WHERE (s."cityId", s."councilMeetingId") = (m."cityId", m.id))
         AND EXISTS (SELECT 1 FROM public."SpeakerSegment" g WHERE (g."cityId", g."meetingId") = (m."cityId", m.id))) w
     WHERE w.rn <= ${spec.meetingsPerBody}`;
    if (spec.pins.length === 0) return window;
    const pins = spec.pins.map(pairLiteral).join(',');
    return `SELECT m."cityId", m.id FROM public."CouncilMeeting" m WHERE (m."cityId", m.id) IN (${pins}) UNION ${window}`;
}

const EXPLICIT_QUERIES: Record<string, (spec: SubsetSpec) => string> = {
    // No foreign keys to City, CouncilMeeting, or Subject exist on this table, and
    // Greenmask drops unplaced candidates through its nullable-chain handling.
    DecisionCandidate: (spec) => {
        const meetings = meetingSetSql(spec);
        const subjects = `SELECT s.id FROM public."Subject" s WHERE (s."cityId", s."councilMeetingId") IN (${meetings})`;
        const decisions = `SELECT d.id FROM public."Decision" d WHERE d."subjectId" IN (${subjects})`;
        return `SELECT dc.* FROM public."DecisionCandidate" dc
 WHERE dc."cityId" IN (SELECT id FROM public."City" WHERE status = 'supported')
   AND (dc."councilMeetingId" IS NULL OR (dc."cityId", dc."councilMeetingId") IN (${meetings}))
   AND (dc."decisionId" IS NULL OR dc."decisionId" IN (${decisions}))
   AND (dc."subjectId" IS NULL OR dc."subjectId" IN (${subjects}))`;
    },
};

export function subsetTransformation(spec: SubsetSpec, explicitQuery: string[]): TransformationEntry[] {
    const meetings = meetingSetSql(spec);
    const entries: TransformationEntry[] = [
        { schema: 'public', name: 'CouncilMeeting', subset_conds: [`(public."CouncilMeeting"."cityId", public."CouncilMeeting".id) IN (${meetings})`] },
        { schema: 'public', name: 'SpeakerTag', subset_conds: [`public."SpeakerTag".id IN (SELECT ss."speakerTagId" FROM public."SpeakerSegment" ss WHERE (ss."cityId", ss."meetingId") IN (${meetings}))`] },
        { schema: 'public', name: 'Location', subset_conds: [`public."Location".id IN (SELECT s."locationId" FROM public."Subject" s WHERE s."locationId" IS NOT NULL AND (s."cityId", s."councilMeetingId") IN (${meetings}))`] },
    ];
    for (const table of explicitQuery) {
        const build = EXPLICIT_QUERIES[table];
        if (!build) throw new Error(`no explicit query for "${table}"; add it to EXPLICIT_QUERIES in greenmask-config.ts`);
        entries.push({ schema: 'public', name: table, query: build(spec) });
    }
    return entries;
}

export type ConfigOptions = {
    conn: ConnectionInfo;
    storageDir: string;
    tmpDir: string;
    pgBinPath?: string;
    privateTables: string[];
    ignoreTables: string[];
    explicitQuery: string[];
    /** Present for the subset dump, absent for the full dump. */
    subset?: SubsetSpec;
    debug?: boolean;
};

export function buildGreenmaskConfig(o: ConfigOptions): GreenmaskConfig {
    const excludeData = [...o.ignoreTables.map((t) => `public.${t}`), ...o.privateTables.map((t) => `public.${quoteIdent(t)}`)];
    return {
        common: { ...(o.pgBinPath ? { pg_bin_path: o.pgBinPath } : {}), tmp_dir: o.tmpDir },
        log: { level: o.debug ? 'debug' : 'info', format: 'text' },
        storage: { type: 'directory', directory: { path: o.storageDir } },
        dump: {
            pg_dump_options: {
                dbname: `host=${quoteConnInfoValue(o.conn.host)} port=${quoteConnInfoValue(String(o.conn.port))} user=${quoteConnInfoValue(o.conn.user)} dbname=${quoteConnInfoValue(o.conn.database)}`,
                jobs: 4,
                // Go's standard gzip writes each table on one core; TaskStatus alone is 2 GB of
                // JSON. pgzip writes the same standard gzip format on every core.
                pgzip: true,
                'no-privileges': true,
                'no-owner': true,
                'exclude-table-data': excludeData,
            },
            transformation: o.subset ? subsetTransformation(o.subset, o.explicitQuery) : [],
        },
    };
}

export function greenmaskConfigYaml(o: ConfigOptions): string {
    return yaml.dump(buildGreenmaskConfig(o), { lineWidth: -1, noRefs: true });
}
