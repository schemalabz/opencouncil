'use client';

import { useTranslations } from 'next-intl';
import { SearchInputPill } from '@/components/ui/search-input-pill';
import { AIGeneratedBadge } from '@/components/AIGeneratedBadge';
import { cn } from '@/lib/utils';

/**
 * The head of a contributions list: title with count, the AI notice, and the
 * compact search pill that hands the query to /search. One component because
 * the person and party pages were carrying it as two byte-identical copies.
 */
export function ContributionsHead({ title, count, placeholder, searchValue, onSearchChange, onSearchSubmit, className }: {
    title: string;
    count: number;
    placeholder: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    onSearchSubmit: (e: React.FormEvent) => void;
    className?: string;
}) {
    const t = useTranslations('search');

    return (
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
            <h2 className="!m-0 !text-left">
                {title}
                {count > 0 && <span className="ml-1.5 text-sm font-normal text-muted-foreground">({count})</span>}
            </h2>
            <AIGeneratedBadge />
            <form onSubmit={onSearchSubmit} className="ml-auto w-full sm:w-[260px]">
                <SearchInputPill
                    value={searchValue}
                    onChange={onSearchChange}
                    placeholder={placeholder}
                    clearAriaLabel={t('clearQuery')}
                    size="sm"
                    className="rounded-full"
                />
            </form>
        </div>
    );
}
