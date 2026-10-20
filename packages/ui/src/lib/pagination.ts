/** Where a pager stands: the page on screen, counted from 1, and how many there are. */
export interface PaginationParams {
    page: number;
    totalPages: number;
}

export function calculatePageNumbers(page: number, totalPages: number): (number | string)[] {
    const MAX_VISIBLE = 7;

    if (totalPages <= MAX_VISIBLE) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [1];

    if (page > 3) {
        pages.push('...');
    }

    const rangeStart = Math.max(2, page - 1);
    const rangeEnd = Math.min(totalPages - 1, page + 1);

    for (let i = rangeStart; i <= rangeEnd; i++) {
        pages.push(i);
    }

    if (page < totalPages - 2) {
        pages.push('...');
    }

    if (pages[pages.length - 1] !== totalPages) {
        pages.push(totalPages);
    }

    return pages;
}
