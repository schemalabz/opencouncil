import yaml from 'js-yaml';
import { buildGreenmaskConfig, greenmaskConfigYaml, meetingSetSql, subsetTransformation } from './greenmask-config';

const conn = { host: '127.0.0.1', port: 54390, user: 'seed', database: 'scratch' };
const spec = { pins: [{ cityId: 'athens', meetingId: 'feb11_2026', reason: 'words' }], meetingsPerBody: 2, asOf: new Date('2026-10-09T01:00:00.000Z') };

describe('meetingSetSql', () => {
    test('excludes a meeting dated after the timestamp of the run, which stands for now()', () => {
        const sql = meetingSetSql(spec);
        expect(sql).toContain(`m."dateTime" <= '2026-10-09T01:00:00.000Z'::timestamptz`);
        expect(sql).not.toContain('now()');
    });

    test('unions the pins with the per-body window over supported cities', () => {
        const sql = meetingSetSql(spec);
        expect(sql).toContain(`('athens','feb11_2026')`);
        expect(sql).toContain(`PARTITION BY m."cityId", coalesce(m."administrativeBodyId", '(none)')`);
        expect(sql).toContain(`c.status = 'supported'`);
        expect(sql).toContain('w.rn <= 2');
    });
    test('ranks meetings that hold a subject and a speaker segment only', () => {
        const sql = meetingSetSql(spec);
        expect(sql).toContain('EXISTS (SELECT 1 FROM public."Subject" s WHERE (s."cityId", s."councilMeetingId") = (m."cityId", m.id))');
        expect(sql).toContain('EXISTS (SELECT 1 FROM public."SpeakerSegment" g WHERE (g."cityId", g."meetingId") = (m."cityId", m.id))');
        // The tests sit in the window subquery, so they run before row_number() ranks.
        expect(sql.indexOf('public."SpeakerSegment" g')).toBeLessThan(sql.indexOf('w.rn <='));
    });
    test('works with no pins', () => {
        expect(meetingSetSql({ pins: [], meetingsPerBody: 1, asOf: spec.asOf })).not.toContain('IN ()');
    });
});

describe('subsetTransformation', () => {
    test('conditions CouncilMeeting, SpeakerTag, Location and gives DecisionCandidate a query', () => {
        const entries = subsetTransformation(spec, ['DecisionCandidate']);
        const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
        expect(byName.CouncilMeeting.subset_conds?.[0]).toContain('public."CouncilMeeting"."cityId", public."CouncilMeeting".id');
        expect(byName.SpeakerTag.subset_conds?.[0]).toContain('ss."speakerTagId"');
        expect(byName.Location.subset_conds?.[0]).toContain('s."locationId"');
        expect(byName.DecisionCandidate.query).toContain('dc."decisionId" IS NULL OR dc."decisionId" IN');
    });
    test('refuses an explicit-query table it has no query for', () => {
        expect(() => subsetTransformation(spec, ['Offer'])).toThrow(/no explicit query for "Offer"/);
    });
});

describe('buildGreenmaskConfig', () => {
    test('excludes private table data, never the tables themselves, and includes the migrations table', () => {
        const cfg = buildGreenmaskConfig({ conn, storageDir: '/tmp/s', tmpDir: '/tmp/t', privateTables: ['User', 'Offer'], ignoreTables: ['spatial_ref_sys'], explicitQuery: [] });
        const dump = cfg.dump.pg_dump_options;
        expect(dump['exclude-table-data']).toEqual(['public.spatial_ref_sys', 'public."User"', 'public."Offer"']);
        expect(dump['exclude-table']).toBeUndefined();
        expect(dump['no-privileges']).toBe(true);
        expect(dump.pgzip).toBe(true);
        expect(dump['no-owner']).toBe(true);
        expect(dump.dbname).toBe("host='127.0.0.1' port='54390' user='seed' dbname='scratch'");
        expect(cfg.dump.transformation).toEqual([]);
    });
    test('quotes conninfo values libpq-style, escaping backslash and single quote in a database name and a host that each contain a space and a quote', () => {
        const quotedConn = { host: `weird host's name`, port: 54390, user: 'seed', database: `back\\slash db's name` };
        const cfg = buildGreenmaskConfig({ conn: quotedConn, storageDir: '/tmp/s', tmpDir: '/tmp/t', privateTables: [], ignoreTables: [], explicitQuery: [] });
        expect(cfg.dump.pg_dump_options.dbname).toBe(
            `host='weird host\\'s name' port='54390' user='seed' dbname='back\\\\slash db\\'s name'`,
        );
    });
    test('renders as YAML that Greenmask can read', () => {
        const text = greenmaskConfigYaml({ conn, storageDir: '/tmp/s', tmpDir: '/tmp/t', privateTables: [], ignoreTables: [], explicitQuery: ['DecisionCandidate'], subset: spec });
        const parsed = yaml.load(text) as { storage: { type: string }; dump: { transformation: unknown[] } };
        expect(parsed.storage.type).toBe('directory');
        expect(parsed.dump.transformation).toHaveLength(4);
    });
});
