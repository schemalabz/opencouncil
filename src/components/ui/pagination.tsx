"use client";

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from './button';
import { PaginationParams } from '@/lib/db/types';

interface PaginationProps extends PaginationParams {
    onPageChange: (page: number) => void;
    labels?: {
        previous: string;
        next: string;
    };
}

export function Pagination({
    currentPage,
    totalPages,
    onPageChange,
    labels = { previous: 'Previous', next: 'Next' }
}: PaginationProps) {
    const pageNumbers = useMemo(() => {
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
    }, [currentPage, totalPages]);

    if (totalPages <= 1) {
        return null;
    }

    return (
        <div className="flex items-center justify-center gap-2 mt-6">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
            >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {labels.previous}
            </Button>

            <div className="flex gap-1">
                {pageNumbers.map((page, idx) =>
                    page === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 py-1">...</span>
                    ) : (
                        <Button
                            key={page}
                            variant={page === currentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => onPageChange(page as number)}
                            className="min-w-[40px]"
                        >
                            {page}
                        </Button>
                    )
                )}
            </div>

            <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
            >
                {labels.next}
                <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
        </div>
    );
}
