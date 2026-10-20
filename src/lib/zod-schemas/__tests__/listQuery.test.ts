import * as z from 'zod';
import { clampPage, listQueryFields, MAX_LIST_LIMIT, pageQueryFields, pageSlice, paginationOf, readPageParam, totalPagesOf } from '../listQuery';
import { adminNotificationsQuerySchema } from '../notification';

const pageQuery = z.object(pageQueryFields);

describe('pageQueryFields', () => {
    it('reads whole numbers, and leaves a blank or missing field undefined', () => {
        expect(pageQuery.parse({ page: '3', pageSize: '20' })).toEqual({ page: 3, pageSize: 20 });
        expect(pageQuery.parse({ page: '', pageSize: '' })).toEqual({ page: undefined, pageSize: undefined });
        expect(pageQuery.parse({})).toEqual({});
    });

    it.each(['0', '-1', '2abc', '1.5', ' 2'])('rejects page %p', page => {
        expect(pageQuery.safeParse({ page }).success).toBe(false);
    });

    it('caps the page size at the list limit, as it caps limit', () => {
        expect(pageQuery.safeParse({ pageSize: String(MAX_LIST_LIMIT) }).success).toBe(true);
        expect(pageQuery.safeParse({ pageSize: String(MAX_LIST_LIMIT + 1) }).success).toBe(false);
        expect(z.object(listQueryFields).safeParse({ limit: String(MAX_LIST_LIMIT + 1) }).success).toBe(false);
    });
});

describe('adminNotificationsQuerySchema paging', () => {
    it('defaults a missing or blank page to the first page of 20', () => {
        expect(adminNotificationsQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
        expect(adminNotificationsQuerySchema.parse({ page: '', pageSize: '' })).toMatchObject({ page: 1, pageSize: 20 });
        expect(adminNotificationsQuerySchema.parse({ page: '2', pageSize: '50' })).toMatchObject({ page: 2, pageSize: 50 });
    });
});

describe('readPageParam', () => {
    it('reads a whole number from 1, and 1 for anything else', () => {
        expect(readPageParam('3')).toBe(3);
        for (const raw of [null, undefined, '', '0', '-1', '2abc', '1.5']) expect(readPageParam(raw)).toBe(1);
    });
});

describe('page arithmetic', () => {
    it('counts the pages, with none for no rows', () => {
        expect(totalPagesOf(130, 12)).toBe(11);
        expect(totalPagesOf(132, 12)).toBe(11);
        expect(totalPagesOf(0, 12)).toBe(0);
    });

    it('keeps a page in range, and moves a page past the end to the last page', () => {
        expect(clampPage(3, 130, 12)).toBe(3);
        expect(clampPage(99, 130, 12)).toBe(11);
        expect(clampPage(0, 130, 12)).toBe(1);
        expect(clampPage(4, 0, 12)).toBe(1);
    });

    it('slices one page of a list', () => {
        const rows = Array.from({ length: 25 }, (_, i) => i);
        expect(pageSlice(rows, 1, 12)).toEqual(rows.slice(0, 12));
        expect(pageSlice(rows, 3, 12)).toEqual([24]);
    });

    it('builds the pagination of a response', () => {
        expect(paginationOf(25, 2, 12)).toEqual({ total: 25, page: 2, pageSize: 12, totalPages: 3 });
    });
});
