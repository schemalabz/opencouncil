import type { Client } from 'pg';
import { parse } from 'pg-connection-string';
import { libpqCompatibleUrl, listForeignKeys, type RawFkRow, unindexedForeignKeys } from './catalog';
import type { CatalogFk } from './normalize';

/** A minimal stand-in for `pg.Client`, exposing only the `query` method `listForeignKeys` calls. */
function fakeClient(rows: RawFkRow[]): Client {
    return { query: jest.fn().mockResolvedValue({ rows }) } as unknown as Client;
}

describe('listForeignKeys', () => {
    test('rejects a row whose parent has no primary key', async () => {
        const client = fakeClient([
            {
                table: 'Orphan',
                constraint: 'Orphan_parentId_fkey',
                columns: ['parentId'],
                refTable: 'Parentless',
                refColumns: ['id'],
                parentPk: null,
                definition: 'FOREIGN KEY ("parentId") REFERENCES "Parentless"(id)',
            },
        ]);
        await expect(listForeignKeys(client)).rejects.toThrow('Orphan_parentId_fkey: parent Parentless has no primary key');
    });

    test('passes through a row whose parent has a primary key', async () => {
        const client = fakeClient([
            {
                table: 'Child',
                constraint: 'Child_parentId_fkey',
                columns: ['parentId'],
                refTable: 'Parent',
                refColumns: ['id'],
                parentPk: ['id'],
                definition: 'FOREIGN KEY ("parentId") REFERENCES "Parent"(id)',
            },
        ]);
        await expect(listForeignKeys(client)).resolves.toEqual([
            expect.objectContaining({ constraint: 'Child_parentId_fkey', parentPk: ['id'] }),
        ]);
    });
});

describe('unindexedForeignKeys', () => {
    const fk = (table: string, columns: string[]): CatalogFk => ({ table, constraint: `${table}_${columns.join('_')}_fkey`, columns, refTable: 'P', refColumns: columns, parentPk: columns, definition: '' });

    test('names a key that no index of its table leads with', () => {
        const fks = [fk('Decision', ['taskId']), fk('Word', ['utteranceId']), fk('Segment', ['cityId', 'meetingId'])];
        const indexes = [
            { table: 'Word', columns: ['utteranceId', 'id'] },
            // A composite key is covered by an index that leads with its columns in any order.
            { table: 'Segment', columns: ['meetingId', 'cityId', 'startTimestamp'] },
            // An index of another table, or one where the key column is not leading, does not cover it.
            { table: 'Other', columns: ['taskId'] },
            { table: 'Decision', columns: ['subjectId', 'taskId'] },
        ];
        expect(unindexedForeignKeys(fks, indexes).map((k) => k.constraint)).toEqual(['Decision_taskId_fkey']);
    });
});

// psql and Prisma read sslmode=require as libpq does; node-postgres must too, or the carry of a staging refresh fails after the commit.
describe('libpqCompatibleUrl', () => {
    test('sslmode=require encrypts without verifying the certificate, as libpq does', () => {
        const ssl = parse(libpqCompatibleUrl('postgresql://u:p@db.example:25060/staging?sslmode=require')).ssl;
        expect(ssl).toEqual(expect.objectContaining({ rejectUnauthorized: false }));
    });

    test('verify-full still verifies, and a URL without sslmode is unchanged', () => {
        expect(parse(libpqCompatibleUrl('postgresql://u:p@db.example:25060/staging?sslmode=verify-full')).ssl).toEqual({});
        expect(libpqCompatibleUrl('postgresql://dev@localhost:5432/opencouncil?host=/tmp/x')).toBe('postgresql://dev@localhost:5432/opencouncil?host=/tmp/x');
    });
});
