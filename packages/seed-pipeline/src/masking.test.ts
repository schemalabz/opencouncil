import type { MaskingRule } from './tables';
import { applyRules, maskingCheckSql, maskingSql } from './masking';

describe('maskingSql', () => {
    test('empty-array', () => {
        expect(maskingSql({ table: 'AdministrativeBody', column: 'contactEmails', action: 'empty-array' })).toBe(
            `UPDATE public."AdministrativeBody" SET "contactEmails" = '{}' WHERE "contactEmails" IS NOT NULL AND "contactEmails" <> '{}';`,
        );
    });
    test('json-remove-key on a text column that holds JSON', () => {
        expect(maskingSql({ table: 'TaskStatus', column: 'requestBody', action: 'json-remove-key', key: 'callbackUrl' })).toBe(
            `UPDATE public."TaskStatus" SET "requestBody" = ("requestBody"::jsonb - 'callbackUrl') WHERE "requestBody" IS NOT NULL AND ("requestBody"::text LIKE '%"callbackUrl"%') AND pg_input_is_valid("requestBody"::text, 'jsonb') AND "requestBody"::jsonb ? 'callbackUrl';`,
        );
    });
    test('json-remove-path removes a nested key from a text column that holds JSON', () => {
        expect(maskingSql({ table: 'TaskStatus', column: 'responseBody', action: 'json-remove-path', path: ['transcript', 'transcription', 'utterances'] })).toBe(
            `UPDATE public."TaskStatus" SET "responseBody" = ("responseBody"::jsonb #- '{"transcript","transcription","utterances"}') WHERE "responseBody" IS NOT NULL AND pg_input_is_valid("responseBody"::text, 'jsonb') AND ("responseBody"::jsonb #> '{"transcript","transcription","utterances"}') IS NOT NULL;`,
        );
    });
    test('json-remove-array-key removes the key from every object of the array, and keeps the order and the other elements', () => {
        const rule: MaskingRule = { table: 'TaskStatus', column: 'responseBody', action: 'json-remove-array-key', path: ['transcript', 'transcription', 'speakers'], key: 'confidence' };
        const elements = `jsonb_array_elements("responseBody"::jsonb #> '{"transcript","transcription","speakers"}') WITH ORDINALITY AS a(e, n)`;
        expect(maskingSql(rule)).toBe(
            `UPDATE public."TaskStatus" SET "responseBody" = jsonb_set("responseBody"::jsonb, '{"transcript","transcription","speakers"}', (SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'object' THEN e - 'confidence' ELSE e END ORDER BY n) FROM ${elements}))`
            + ` WHERE "responseBody"::text LIKE '%"confidence"%' AND "responseBody" IS NOT NULL AND pg_input_is_valid("responseBody"::text, 'jsonb') AND jsonb_typeof("responseBody"::jsonb #> '{"transcript","transcription","speakers"}') = 'array'`
            + ` AND EXISTS (SELECT 1 FROM ${elements} WHERE jsonb_typeof(e) = 'object' AND e ? 'confidence');`,
        );
    });
    test('json-remove-path quotes and escapes each path element', () => {
        // Each element becomes one double-quoted array element. A backslash and a
        // double quote get a backslash in front, and the SQL literal doubles `'`.
        // A `,`, `{`, or `}` stays inside the quotes, so it does not split or end the array.
        expect(maskingSql({ table: 'T', column: 'c', action: 'json-remove-path', path: [`it's`, 'a"b', 'c,d', '{e}', 'f\\g'] })).toBe(
            `UPDATE public."T" SET "c" = ("c"::jsonb #- '{"it''s","a\\"b","c,d","{e}","f\\\\g"}') WHERE "c" IS NOT NULL AND pg_input_is_valid("c"::text, 'jsonb') AND ("c"::jsonb #> '{"it''s","a\\"b","c,d","{e}","f\\\\g"}') IS NOT NULL;`,
        );
    });
    test('null-when', () => {
        expect(maskingSql({ table: 'City', column: 'geometry', action: 'null-when', when: "status <> 'supported'" })).toBe(
            `UPDATE public."City" SET "geometry" = NULL WHERE (status <> 'supported') AND "geometry" IS NOT NULL;`,
        );
    });
    test('delete-when removes whole rows', () => {
        expect(maskingSql({ table: 'Location', action: 'delete-when', when: 'NOT EXISTS (SELECT 1 FROM public."Subject" s WHERE s."locationId" = "Location".id)' })).toBe(
            `DELETE FROM public."Location" WHERE (NOT EXISTS (SELECT 1 FROM public."Subject" s WHERE s."locationId" = "Location".id));`,
        );
    });
    test('set-null', () => {
        expect(maskingSql({ table: 'T', column: 'c', action: 'set-null' })).toBe(`UPDATE public."T" SET "c" = NULL WHERE "c" IS NOT NULL;`);
    });
});

describe('maskingCheckSql', () => {
    test('counts rows the rule would still change', () => {
        expect(maskingCheckSql({ table: 'TaskStatus', column: 'requestBody', action: 'json-remove-key', key: 'callbackUrl' })).toBe(
            `SELECT count(*)::text AS n FROM public."TaskStatus" WHERE "requestBody" IS NOT NULL AND pg_input_is_valid("requestBody"::text, 'jsonb') AND "requestBody"::jsonb ? 'callbackUrl'`,
        );
        expect(maskingCheckSql({ table: 'City', column: 'geometry', action: 'null-when', when: "status <> 'supported'" })).toBe(
            `SELECT count(*)::text AS n FROM public."City" WHERE (status <> 'supported') AND "geometry" IS NOT NULL`,
        );
        expect(maskingCheckSql({ table: 'Location', action: 'delete-when', when: 'x' })).toBe(`SELECT count(*)::text AS n FROM public."Location" WHERE (x)`);
        expect(maskingCheckSql({ table: 'TaskStatus', column: 'responseBody', action: 'json-remove-path', path: ['transcript', 'transcription', 'utterances'] })).toBe(
            `SELECT count(*)::text AS n FROM public."TaskStatus" WHERE "responseBody" IS NOT NULL AND pg_input_is_valid("responseBody"::text, 'jsonb') AND ("responseBody"::jsonb #> '{"transcript","transcription","utterances"}') IS NOT NULL`,
        );
    });
});

test('applyRules removes the keys of one column in one UPDATE, at the place of the first rule', () => {
    const statements = applyRules([
        { table: 'TaskStatus', column: 'requestBody', action: 'json-remove-key', key: 'callbackUrl' },
        { table: 'City', column: 'geometry', action: 'set-null' },
        { table: 'TaskStatus', column: 'requestBody', action: 'json-remove-key', key: 'voiceprints' },
        { table: 'TaskStatus', column: 'responseBody', action: 'json-remove-key', key: 'voiceprint' },
    ]);
    expect(statements).toEqual([
        `UPDATE public."TaskStatus" SET "requestBody" = ("requestBody"::jsonb - 'callbackUrl' - 'voiceprints') WHERE "requestBody" IS NOT NULL AND ("requestBody"::text LIKE '%"callbackUrl"%' OR "requestBody"::text LIKE '%"voiceprints"%') AND pg_input_is_valid("requestBody"::text, 'jsonb') AND "requestBody"::jsonb ?| '{"callbackUrl","voiceprints"}'::text[];`,
        `UPDATE public."City" SET "geometry" = NULL WHERE "geometry" IS NOT NULL;`,
        `UPDATE public."TaskStatus" SET "responseBody" = ("responseBody"::jsonb - 'voiceprint') WHERE "responseBody" IS NOT NULL AND ("responseBody"::text LIKE '%"voiceprint"%') AND pg_input_is_valid("responseBody"::text, 'jsonb') AND "responseBody"::jsonb ? 'voiceprint';`,
    ]);
});

test('applyRules restricts the rules of a scoped table, and the check stays unscoped and without the LIKE test', () => {
    const rule: MaskingRule = { table: 'TaskStatus', column: 'responseBody', action: 'json-remove-path', path: ['transcript'] };
    expect(applyRules([rule, { table: 'City', column: 'geometry', action: 'set-null' }], { TaskStatus: 'x = 1' })).toEqual([
        `UPDATE public."TaskStatus" SET "responseBody" = ("responseBody"::jsonb #- '{"transcript"}') WHERE "responseBody" IS NOT NULL AND pg_input_is_valid("responseBody"::text, 'jsonb') AND ("responseBody"::jsonb #> '{"transcript"}') IS NOT NULL AND (x = 1);`,
        `UPDATE public."City" SET "geometry" = NULL WHERE "geometry" IS NOT NULL;`,
    ]);
    expect(maskingCheckSql({ table: 'TaskStatus', column: 'requestBody', action: 'json-remove-key', key: 'callbackUrl' })).not.toContain('LIKE');
});

test('applyRules keeps rule order', () => {
    expect(applyRules([{ table: 'T', column: 'a', action: 'set-null' }, { table: 'T', column: 'b', action: 'set-null' }])).toEqual([
        `UPDATE public."T" SET "a" = NULL WHERE "a" IS NOT NULL;`,
        `UPDATE public."T" SET "b" = NULL WHERE "b" IS NOT NULL;`,
    ]);
});
