import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { ArrowRight, Maximize2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSearchHref } from '@/components/search/searchFilterTypes';
import { captureLandingAction } from '@/lib/landing/analytics';
import type { MapFilters } from '@/lib/landing/landingCore';
import type { CommittedSearch } from './hooks/useCommittedSearch';

/** The landing's filters as the /search page spells them, for handing a search on. */
export function landingSearchHref(query: string, cats: string[], filters: MapFilters): string {
    return buildSearchHref({
        query,
        cityId: filters.cityIds[0],
        topicIds: cats.length > 0 ? cats.join(',') : undefined,
        adminBodyType: filters.bodyTypes[0],
        dateFrom: filters.dateFrom ?? undefined,
        dateTo: filters.dateTo ?? undefined,
    });
}

/**
 * What the list is, while a search is running it.
 *
 * Takes the place of the "most-discussed" caption, which describes the map's own
 * ranking and would be a lie over a relevance-ordered result set.
 */
export function SearchChip({
    search,
    onClear,
    floating,
}: {
    search: CommittedSearch;
    onClear: () => void;
    /** pill over the map (mobile) rather than a row in the panel header */
    floating?: boolean;
}) {
    const t = useTranslations('landingV2');
    return (
        <div
            // Opaque in both variants. This sits over the map, and a tinted
            // background let place labels read straight through the text.
            className={cn(
                'inline-flex shrink-0 max-w-[16rem] items-center gap-1.5 rounded-full border bg-card text-sm shadow-md',
                floating ? 'border-border px-3 py-1.5 backdrop-blur' : 'h-8 border-[hsl(var(--orange))]/40 px-3',
            )}
        >
            <Search className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--orange))]" aria-hidden="true" />
            <span className="min-w-0 truncate text-muted-foreground">
                {t('search.searchingFor')}{' '}
                <span className="font-semibold text-foreground">“{search.query}”</span>
            </span>
            <button
                type="button"
                onClick={onClear}
                aria-label={t('search.clearSearch')}
                className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
        </div>
    );
}

/**
 * What the viewport is hiding, at the foot of the list.
 *
 * The map does not move when a search is committed, so results can land
 * anywhere — including nowhere the reader is looking. Without this an empty
 * panel reads as "nothing matched", which is the one thing it does not mean.
 */
export function SearchResultsFooter({
    search,
    outsideViewCount,
    cats,
    filters,
    onFitResults,
}: {
    search: CommittedSearch;
    outsideViewCount: number;
    cats: string[];
    filters: MapFilters;
    onFitResults: () => void;
}) {
    const t = useTranslations('landingV2');
    const rowClass =
        'flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background/60 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground';

    return (
        <div className="mt-1 flex shrink-0 flex-col gap-2">
            {outsideViewCount > 0 && (
                <button type="button" onClick={onFitResults} className={rowClass}>
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('search.outsideArea', { count: outsideViewCount })}
                </button>
            )}
            <Link
                href={landingSearchHref(search.query, cats, filters)}
                onClick={() => captureLandingAction('search_handoff', { query_length: search.query.length })}
                className={rowClass}
            >
                {t('search.everywhere')}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            {search.truncated && (
                <p className="px-1 text-center text-xs text-muted-foreground">{t('search.truncated')}</p>
            )}
        </div>
    );
}
