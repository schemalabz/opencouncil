import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { AlertCircle, ArrowRight, Maximize2, RotateCw, Search, X } from 'lucide-react';
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
}: {
    search: CommittedSearch;
    onClear: () => void;
}) {
    const t = useTranslations('landingV2');
    return (
        <div
            // Opaque: this sits over the map, and a tinted background let place
            // labels read straight through the text.
            className={cn(
                'inline-flex h-8 shrink-0 max-w-[16rem] items-center gap-1.5 rounded-full border px-3',
                'border-[hsl(var(--orange))]/40 bg-card text-sm shadow-md',
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
 * A search that did not answer.
 *
 * Sits beside the chip, in the one place both layouts already have. Without it
 * a failure is silent: the map keeps whatever the last successful run put there,
 * which is the right thing to keep — it is not the right thing to leave
 * unexplained, because it reads as an answer to the query still in the box.
 */
export function SearchErrorPill({ onRetry, floating }: { onRetry: () => void; floating?: boolean }) {
    const t = useTranslations('landingV2');
    return (
        <div
            className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-destructive/40 bg-card text-sm shadow-md',
                floating ? 'px-3 py-1.5' : 'h-8 px-3',
            )}
            role="status"
        >
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
            <span className="min-w-0 truncate text-muted-foreground">{t('search.failed')}</span>
            <button
                type="button"
                onClick={onRetry}
                className="-mr-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
            >
                <RotateCw className="h-3 w-3" aria-hidden="true" />
                {t('search.retry')}
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

/**
 * The same three things, as the last card of the mobile strip.
 *
 * The strip is horizontal, so it has no foot to put a row under — but its end is
 * where a reader who has been through the results arrives, which is the position
 * the desktop footer occupies. Matches StripCard's dimensions so the row keeps
 * one height.
 */
export function SearchResultsCard({
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
        'flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-2 py-2 text-center text-xs font-medium text-muted-foreground';

    return (
        <div className="flex h-[150px] w-[248px] shrink-0 flex-col justify-center gap-2 rounded-2xl border border-black/20 bg-card p-3 shadow-md">
            {outsideViewCount > 0 && (
                <button type="button" onClick={onFitResults} className={rowClass}>
                    <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('search.outsideArea', { count: outsideViewCount })}
                </button>
            )}
            <Link
                href={landingSearchHref(search.query, cats, filters)}
                onClick={() => captureLandingAction('search_handoff', { query_length: search.query.length })}
                className={rowClass}
            >
                {t('search.everywhere')}
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </Link>
            {search.truncated && (
                <p className="px-1 text-center text-[11px] text-muted-foreground">{t('search.truncated')}</p>
            )}
        </div>
    );
}
