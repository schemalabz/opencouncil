import { calculatePageNumbers } from '../pagination';

describe('calculatePageNumbers', () => {
    describe('when totalPages <= 7', () => {
        it('should return all pages for 1 page', () => {
            expect(calculatePageNumbers(1, 1)).toEqual([1]);
        });

        it('should return all pages for 5 pages', () => {
            expect(calculatePageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
        });

        it('should return all pages for exactly 7 pages', () => {
            expect(calculatePageNumbers(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        });
    });

    describe('when totalPages > 7', () => {
        it('should show ellipsis at end when on page 1', () => {
            expect(calculatePageNumbers(1, 10)).toEqual([1, 2, '...', 10]);
        });

        it('should show ellipsis at end when on page 2', () => {
            expect(calculatePageNumbers(2, 10)).toEqual([1, 2, 3, '...', 10]);
        });

        it('should show ellipsis at end when on page 3', () => {
            expect(calculatePageNumbers(3, 10)).toEqual([1, 2, 3, 4, '...', 10]);
        });

        it('should show ellipsis on both sides when in middle', () => {
            expect(calculatePageNumbers(5, 10)).toEqual([1, '...', 4, 5, 6, '...', 10]);
        });

        it('should show ellipsis at start when near end', () => {
            expect(calculatePageNumbers(8, 10)).toEqual([1, '...', 7, 8, 9, 10]);
        });

        it('should show ellipsis at start when on second-to-last page', () => {
            expect(calculatePageNumbers(9, 10)).toEqual([1, '...', 8, 9, 10]);
        });

        it('should show ellipsis at start when on last page', () => {
            expect(calculatePageNumbers(10, 10)).toEqual([1, '...', 9, 10]);
        });
    });

    describe('edge cases', () => {
        it('should handle large page counts', () => {
            const result = calculatePageNumbers(50, 100);
            expect(result).toEqual([1, '...', 49, 50, 51, '...', 100]);
        });

        it('should handle page 4 (boundary case for left ellipsis)', () => {
            expect(calculatePageNumbers(4, 10)).toEqual([1, '...', 3, 4, 5, '...', 10]);
        });

        it('should handle totalPages - 2 (boundary case for right ellipsis)', () => {
            expect(calculatePageNumbers(8, 10)).toEqual([1, '...', 7, 8, 9, 10]);
        });
    });
});

describe('pagination reset on search/filter change', () => {
    function updateParamsWithPageReset(currentParams: string, updates: Record<string, string | null>): string {
        const params = new URLSearchParams(currentParams);
        for (const [key, value] of Object.entries(updates)) {
            if (value === null) {
                params.delete(key);
            } else {
                params.set(key, value);
            }
        }
        params.delete('page');
        return params.toString();
    }

    it('should reset page when search changes', () => {
        const result = updateParamsWithPageReset('page=3', { search: 'test' });
        expect(result).toBe('search=test');
    });

    it('should reset page when filter changes', () => {
        const result = updateParamsWithPageReset('page=3', { filters: 'someFilter' });
        expect(result).toBe('filters=someFilter');
    });

    it('should reset page when search is cleared', () => {
        const result = updateParamsWithPageReset('page=3&search=old', { search: null });
        expect(result).toBe('');
    });

    it('should preserve other params when resetting page', () => {
        const result = updateParamsWithPageReset('page=3&other=value', { search: 'test' });
        expect(result).toBe('other=value&search=test');
    });
});
