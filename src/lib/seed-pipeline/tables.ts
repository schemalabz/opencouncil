import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// Removes whole rows, for a table whose rows can be private although the table is content.
const deleteWhenRule = z.object({ table: z.string(), action: z.literal('delete-when'), when: z.string() });

const maskingRule = z.discriminatedUnion('action', [
    z.object({ table: z.string(), column: z.string(), action: z.literal('set-null') }),
    z.object({ table: z.string(), column: z.string(), action: z.literal('empty-array') }),
    z.object({ table: z.string(), column: z.string(), action: z.literal('json-remove-key'), key: z.string() }),
    z.object({ table: z.string(), column: z.string(), action: z.literal('json-remove-path'), path: z.array(z.string().min(1)).nonempty() }),
    z.object({ table: z.string(), column: z.string(), action: z.literal('null-when'), when: z.string() }),
    deleteWhenRule,
]);
export type MaskingRule = z.infer<typeof maskingRule>;

const schemaEntry = z.object({
    prisma: z.string(),
    content: z.array(z.string()),
    private: z.array(z.string()),
});

export const tablesConfigSchema = z.object({
    schemas: z.record(schemaEntry),
    explicitQuery: z.array(z.string()),
    /**
     * Rules that read a column which `produce` nulls because it points at a private
     * table, so they run before the nulling. `verify` cannot check them afterwards.
     */
    beforeNulling: z.array(deleteWhenRule),
    masking: z.array(maskingRule),
    subsetOnly: z.array(maskingRule),
    publicText: z.array(z.string()),
    ignoreTables: z.array(z.string()),
});
export type TablesConfig = z.infer<typeof tablesConfigSchema>;

/** Resolved against SEED_PIPELINE_HOME when the packaged CLI runs, else the repo. */
export function pipelineHome(): string {
    return process.env.SEED_PIPELINE_HOME ?? path.join(process.cwd(), 'scripts', 'seed-pipeline');
}
export const TABLES_JSON = path.join(pipelineHome(), 'tables.json');
export const PINNED_FILE = path.join(pipelineHome(), 'pinned-meetings.txt');
export const EXPECTED_COUNTS_SQL = path.join(pipelineHome(), 'expected-counts.sql');
export const MIGRATIONS_TABLE = '_prisma_migrations';

export function loadTablesConfig(file: string = TABLES_JSON): TablesConfig {
    return tablesConfigSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function contentTables(cfg: TablesConfig): string[] {
    return cfg.schemas.main.content;
}

export function privateTables(cfg: TablesConfig): string[] {
    return cfg.schemas.main.private;
}

/** Tables whose rows the backup filter lets through: content plus the migrations table. */
export function allowedTables(cfg: TablesConfig): Set<string> {
    return new Set([...contentTables(cfg), MIGRATIONS_TABLE]);
}

/** Every table name the classification knows for the main schema, including ignored ones. */
export function knownTables(cfg: TablesConfig): Set<string> {
    return new Set([...contentTables(cfg), ...privateTables(cfg), ...cfg.ignoreTables, MIGRATIONS_TABLE]);
}

export type Pin = { cityId: string; meetingId: string; reason: string };

const PIN_LINE = /^([a-z0-9-]+)\/([A-Za-z0-9_-]+)\s*(?:#\s*(.*))?$/;

export function parsePinnedMeetings(text: string): Pin[] {
    const pins: Pin[] = [];
    text.split('\n').forEach((raw, index) => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) return;
        const match = PIN_LINE.exec(line);
        if (!match) {
            throw new Error(`pinned-meetings.txt line ${index + 1}: expected "city/meeting  # reason", got "${raw}"`);
        }
        pins.push({ cityId: match[1], meetingId: match[2], reason: (match[3] ?? '').trim() });
    });
    return pins;
}

export function loadPinnedMeetings(file: string = PINNED_FILE): Pin[] {
    return parsePinnedMeetings(fs.readFileSync(file, 'utf8'));
}
