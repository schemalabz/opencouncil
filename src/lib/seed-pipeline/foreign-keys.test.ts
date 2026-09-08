import { orphanForeignKeys, parseForeignKeyStatement } from './foreign-keys';

const STATEMENT = 'ALTER TABLE ONLY public."Decision" ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;';
const COMPOSITE = 'ALTER TABLE ONLY public."SpeakerSegment" ADD CONSTRAINT "SpeakerSegment_meetingId_cityId_fkey" FOREIGN KEY ("meetingId", "cityId") REFERENCES public."CouncilMeeting"(id, "cityId") ON UPDATE CASCADE ON DELETE CASCADE;';

describe('parseForeignKeyStatement', () => {
    test('parses a single-column key with actions', () => {
        expect(parseForeignKeyStatement(STATEMENT)).toEqual({
            table: 'Decision',
            constraint: 'Decision_createdById_fkey',
            columns: ['createdById'],
            refTable: 'User',
            refColumns: ['id'],
            definition: 'FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL',
            statement: STATEMENT,
        });
    });

    test('parses a composite key', () => {
        const fk = parseForeignKeyStatement(COMPOSITE);
        expect(fk?.columns).toEqual(['meetingId', 'cityId']);
        expect(fk?.refColumns).toEqual(['id', 'cityId']);
    });

    test('returns null for other statements', () => {
        expect(parseForeignKeyStatement('ALTER TABLE ONLY public."City" ADD CONSTRAINT "City_pkey" PRIMARY KEY (id);')).toBeNull();
    });
});

describe('orphanForeignKeys', () => {
    test('keeps only keys whose target table is not included', () => {
        const fks = [parseForeignKeyStatement(STATEMENT), parseForeignKeyStatement(COMPOSITE)].flatMap((f) => (f ? [f] : []));
        expect(orphanForeignKeys(fks, new Set(['Decision', 'SpeakerSegment', 'CouncilMeeting'])).map((f) => f.constraint)).toEqual(['Decision_createdById_fkey']);
    });
});
