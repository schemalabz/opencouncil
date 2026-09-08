import {
    allowedTables,
    loadPinnedMeetings,
    loadTablesConfig,
    parsePinnedMeetings,
    tablesConfigSchema,
    MIGRATIONS_TABLE,
} from './tables';
import { listPrismaModelsFromFile } from './prisma-models';

const cfg = loadTablesConfig();
const everyContent = new Set(Object.values(cfg.schemas).flatMap((s) => s.content));

describe('tables.json classification', () => {
    for (const [name, schema] of Object.entries(cfg.schemas)) {
        test(`${name}: every Prisma model is classified exactly once`, () => {
            const models = listPrismaModelsFromFile(schema.prisma);
            const classified = [...schema.content, ...schema.private];
            const duplicates = classified.filter((t, i) => classified.indexOf(t) !== i);
            const unclassified = models.filter((m) => !classified.includes(m));
            const removed = classified.filter((t) => !models.includes(t));
            // The messages tell the author what to do, because this test is the gate
            // that keeps personal data out of the seed artifacts.
            const problems = [
                ...unclassified.map((m) => `${m} is not classified. Add it to scripts/seed-pipeline/tables.json under schemas.${name}.content (public record that ships in the seed artifacts) or schemas.${name}.private (personal data that never ships). See scripts/seed-pipeline/README.md.`),
                ...removed.map((t) => `${t} is in scripts/seed-pipeline/tables.json, but ${schema.prisma} has no such model. Remove it from schemas.${name}.`),
                ...[...new Set(duplicates)].map((t) => `${t} appears more than once in schemas.${name}. Keep it under content or private only.`),
            ];
            expect(problems).toEqual([]);
        });
    }

    test('beforeNulling, masking, subsetOnly, explicitQuery, and publicText name content tables', () => {
        const named = [
            ...cfg.beforeNulling.map((r) => r.table),
            ...cfg.masking.map((r) => r.table),
            ...cfg.subsetOnly.map((r) => r.table),
            ...cfg.explicitQuery,
            ...cfg.publicText,
        ];
        expect(named.filter((t) => !everyContent.has(t))).toEqual([]);
    });

    test('allowed tables are the main content tables plus the migrations table', () => {
        const allowed = allowedTables(cfg);
        expect(allowed.has(MIGRATIONS_TABLE)).toBe(true);
        expect(allowed.has('User')).toBe(false);
        expect(allowed.has('CouncilMeeting')).toBe(true);
    });

    test('pinned-meetings.txt parses', () => {
        expect(() => loadPinnedMeetings()).not.toThrow();
    });

    test('parsePinnedMeetings reads city/meeting with a reason and rejects other shapes', () => {
        expect(parsePinnedMeetings('# comment\nathens/feb11_2026  # transcript editor words\n')).toEqual([
            { cityId: 'athens', meetingId: 'feb11_2026', reason: 'transcript editor words' },
        ]);
        expect(() => parsePinnedMeetings('athens feb11_2026')).toThrow(/line 1/);
    });
});

describe('json-remove-path rules', () => {
    const parses = (path: unknown) =>
        tablesConfigSchema.safeParse({ ...cfg, masking: [{ table: 'TaskStatus', column: 'responseBody', action: 'json-remove-path', path }] }).success;

    test('accept a non-empty array of non-empty keys, and reject other paths', () => {
        expect(parses(['transcript', 'transcription', 'utterances'])).toBe(true);
        expect(parses([])).toBe(false);
        expect(parses(['transcript', ''])).toBe(false);
        expect(parses('transcript')).toBe(false);
    });
});
