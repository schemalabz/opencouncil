'use client';

import { Input } from '@/components/ui/input';
import { SearchSpinIcon } from '@/components/ui/search-spin-icon';
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
    return (
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
            <h2 className="!m-0 !text-left text-lg font-semibold sm:text-xl">
                {title}
                {count > 0 && <span className="ml-1.5 text-sm font-normal text-muted-foreground">({count})</span>}
            </h2>
            <AIGeneratedBadge />
            <form onSubmit={onSearchSubmit} className="group relative ml-auto w-full sm:w-[260px]">
                <SearchSpinIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder={placeholder}
                    className="h-8 rounded-full pl-9 text-xs"
                    value={searchValue}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </form>
        </div>
    );
}
