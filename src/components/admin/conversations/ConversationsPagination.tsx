"use client";

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/ui/pagination';

/**
 * Drives the conversations list pagination via the `?page=N` search param,
 * preserving any other params (e.g. `?all=1`). Page 1 omits the param to keep
 * the default URL clean.
 */
export function ConversationsPagination({
    currentPage,
    totalPages,
    pageSize,
}: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const onPageChange = (page: number) => {
        const params = new URLSearchParams(searchParams.toString());
        if (page <= 1) {
            params.delete('page');
        } else {
            params.set('page', String(page));
        }
        const query = params.toString();
        router.push(query ? `${pathname}?${query}` : pathname);
    };

    return (
        <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={onPageChange}
        />
    );
}
