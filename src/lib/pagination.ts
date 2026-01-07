export function calculatePageNumbers(currentPage: number, totalPages: number): (number | string)[] {
    const MAX_VISIBLE = 7;

    if (totalPages <= MAX_VISIBLE) {
        return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [1];

    if (currentPage > 3) {
        pages.push('...');
    }

    const rangeStart = Math.max(2, currentPage - 1);
    const rangeEnd = Math.min(totalPages - 1, currentPage + 1);

    for (let i = rangeStart; i <= rangeEnd; i++) {
        pages.push(i);
    }

    if (currentPage < totalPages - 2) {
        pages.push('...');
    }

    if (pages[pages.length - 1] !== totalPages) {
        pages.push(totalPages);
    }

    return pages;
}
