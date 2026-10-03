"use client";

import { useMemo, type MouseEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from './button';
import { PaginationParams } from './lib/pagination';
import { calculatePageNumbers } from './lib/pagination';

interface PaginationProps extends Omit<PaginationParams, 'pageSize'> {
    pageSize?: number;
    onPageChange: (page: number) => void;
    /**
     * The URL of a page. With it, each control is a link: a new tab, a crawler
     * and a page before hydration can follow it, and a plain click still goes
     * through onPageChange.
     */
    getHref?: (page: number) => string;
    labels?: {
        previous: string;
        next: string;
        navigation?: string;
    };
}

/** A click that the browser should handle: a new tab, a new window, a download. */
function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
    return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function PageControl({
    page,
    onPageChange,
    getHref,
    disabled = false,
    current = false,
    className,
    children,
}: {
    page: number;
    onPageChange: (page: number) => void;
    getHref?: (page: number) => string;
    disabled?: boolean;
    current?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const variant = current ? "default" : "outline";
    if (!getHref || disabled) {
        return (
            <Button
                variant={variant}
                size="sm"
                onClick={() => onPageChange(page)}
                disabled={disabled}
                aria-current={current ? 'page' : undefined}
                className={className}
            >
                {children}
            </Button>
        );
    }
    return (
        <Button asChild variant={variant} size="sm" className={className}>
            <a
                href={getHref(page)}
                aria-current={current ? 'page' : undefined}
                onClick={event => {
                    if (isModifiedClick(event)) return;
                    event.preventDefault();
                    onPageChange(page);
                }}
            >
                {children}
            </a>
        </Button>
    );
}

export function Pagination({
    currentPage,
    totalPages,
    onPageChange,
    getHref,
    labels = { previous: 'Previous', next: 'Next' }
}: PaginationProps) {
    const pageNumbers = useMemo(
        () => calculatePageNumbers(currentPage, totalPages),
        [currentPage, totalPages]
    );

    if (totalPages <= 1) {
        return null;
    }

    return (
        <nav aria-label={labels.navigation} className="flex items-center justify-center gap-2 mt-6">
            <PageControl page={currentPage - 1} onPageChange={onPageChange} getHref={getHref} disabled={currentPage === 1}>
                <ChevronLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">{labels.previous}</span>
            </PageControl>

            <div className="flex gap-1">
                {pageNumbers.map((page, idx) =>
                    page === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 py-1">...</span>
                    ) : (
                        <PageControl
                            key={page}
                            page={page as number}
                            onPageChange={onPageChange}
                            getHref={getHref}
                            current={page === currentPage}
                            className="min-w-[40px]"
                        >
                            {page}
                        </PageControl>
                    )
                )}
            </div>

            <PageControl page={currentPage + 1} onPageChange={onPageChange} getHref={getHref} disabled={currentPage === totalPages}>
                <span className="hidden sm:inline">{labels.next}</span>
                <ChevronRight className="h-4 w-4 sm:ml-1" />
            </PageControl>
        </nav>
    );
}
