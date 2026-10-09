import { parseForeignKeyStatement } from './foreign-keys';
import { buildNormalization, dropPgSyncSql, nullDanglingSelfReferenceSql, nullOrphanColumnsSql, reorderedDefinition, CatalogFk, temporaryIndexSql } from './normalize';

const misordered: CatalogFk = {
    table: 'SpeakerSegment',
    constraint: 'SpeakerSegment_meetingId_cityId_fkey',
    columns: ['meetingId', 'cityId'],
    refTable: 'CouncilMeeting',
    refColumns: ['id', 'cityId'],
    parentPk: ['cityId', 'id'],
    definition: 'FOREIGN KEY ("meetingId", "cityId") REFERENCES "CouncilMeeting"(id, "cityId") ON UPDATE CASCADE ON DELETE CASCADE',
};

const selfRef: CatalogFk = {
    table: 'Subject',
    constraint: 'Subject_discussedInId_fkey',
    columns: ['discussedInId'],
    refTable: 'Subject',
    refColumns: ['id'],
    parentPk: ['id'],
    definition: 'FOREIGN KEY ("discussedInId") REFERENCES "Subject"(id) ON UPDATE CASCADE ON DELETE SET NULL',
};

describe('nullOrphanColumnsSql', () => {
    test('emits one UPDATE per orphan column', () => {
        const fk = parseForeignKeyStatement('ALTER TABLE ONLY public."Decision" ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON DELETE SET NULL;');
        expect(nullOrphanColumnsSql(fk ? [fk] : [])).toEqual([
            'UPDATE public."Decision" SET "createdById" = NULL WHERE "createdById" IS NOT NULL;',
        ]);
    });
});

describe('reorderedDefinition', () => {
    test('permutes the child columns into the parent primary-key order and keeps the actions', () => {
        expect(reorderedDefinition(misordered)).toBe(
            'FOREIGN KEY ("cityId", "meetingId") REFERENCES public."CouncilMeeting"("cityId", "id") ON UPDATE CASCADE ON DELETE CASCADE',
        );
    });
});

describe('buildNormalization', () => {
    test('re-declares misordered keys, drops self-references and explicit-query keys, and re-adds the dropped ones after restore', () => {
        const { sql, postRestoreSql } = buildNormalization({ misordered: [misordered], selfReferencing: [selfRef], explicitQueryFks: [] });
        expect(sql).toEqual([
            'ALTER TABLE public."SpeakerSegment" DROP CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey";',
            'ALTER TABLE public."SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey" FOREIGN KEY ("cityId", "meetingId") REFERENCES public."CouncilMeeting"("cityId", "id") ON UPDATE CASCADE ON DELETE CASCADE;',
            'ALTER TABLE public."Subject" DROP CONSTRAINT "Subject_discussedInId_fkey";',
            'DROP SCHEMA IF EXISTS aiven_extras CASCADE;',
        ]);
        expect(postRestoreSql).toEqual([
            'UPDATE public."Subject" SET "discussedInId" = NULL WHERE "discussedInId" IS NOT NULL AND "discussedInId" NOT IN (SELECT "id" FROM public."Subject");',
            'ALTER TABLE public."Subject" ADD CONSTRAINT "Subject_discussedInId_fkey" FOREIGN KEY ("discussedInId") REFERENCES "Subject"(id) ON UPDATE CASCADE ON DELETE SET NULL;',
        ]);
    });
});

describe('nullDanglingSelfReferenceSql', () => {
    test('nulls only the values whose parent row the subset left out', () => {
        expect(nullDanglingSelfReferenceSql(selfRef)).toBe(
            'UPDATE public."Subject" SET "discussedInId" = NULL WHERE "discussedInId" IS NOT NULL AND "discussedInId" NOT IN (SELECT "id" FROM public."Subject");',
        );
    });
    test('refuses a composite self-referencing key', () => {
        const composite: CatalogFk = { ...selfRef, columns: ['cityId', 'discussedInId'], refColumns: ['cityId', 'id'] };
        expect(() => nullDanglingSelfReferenceSql(composite)).toThrow(/composite self-referencing key is not supported/);
    });
});

describe('dropPgSyncSql', () => {
    test('drops the triggers, then the function, then the materialized view, with quoted identifiers', () => {
        expect(dropPgSyncSql({
            triggers: [
                { schema: 'public', table: 'City', trigger: 'public_City_notify' },
                { schema: 'public', table: 'City', trigger: 'public_City_truncate' },
                { schema: 'public', table: 'Odd"Name', trigger: 'public_Odd"Name_notify' },
            ],
            hasFunction: true,
            hasView: true,
        })).toEqual([
            'DROP TRIGGER "public_City_notify" ON "public"."City";',
            'DROP TRIGGER "public_City_truncate" ON "public"."City";',
            'DROP TRIGGER "public_Odd""Name_notify" ON "public"."Odd""Name";',
            'DROP FUNCTION public."table_notify"();',
            'DROP MATERIALIZED VIEW public."_view";',
        ]);
    });
    test('gives no statements when the database has no PGSync objects', () => {
        expect(dropPgSyncSql({ triggers: [], hasFunction: false, hasView: false })).toEqual([]);
    });
});

describe('temporaryIndexSql', () => {
    test('creates one index per key with quoted names, and drops each one', () => {
        expect(temporaryIndexSql([{ table: 'Decision', columns: ['taskId'] }, { table: 'Odd"T', columns: ['a', 'b'] }])).toEqual({
            create: ['CREATE INDEX "seed_tmp_fk_0" ON public."Decision" ("taskId");', 'CREATE INDEX "seed_tmp_fk_1" ON public."Odd""T" ("a", "b");'],
            drop: ['DROP INDEX public."seed_tmp_fk_0";', 'DROP INDEX public."seed_tmp_fk_1";'],
        });
    });
});
