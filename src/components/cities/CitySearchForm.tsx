import { Search, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routing, urlPrefixForLocale } from '@/i18n/routing';

interface CitySearchFormProps {
    cityId: string;
    locale: string;
}

/**
 * The city page's one search box, scoped to this municipality.
 *
 * A plain GET form rather than a client component: /search already reads `query`
 * and `cityId` off the URL, so there is nothing for JavaScript to do, and the
 * field works before hydration.
 *
 * The action carries the locale prefix explicitly. next-intl prefixes
 * `as-needed`, so a bare "/search" would drop the visitor from /en/chania back
 * to the default locale.
 */
export function CitySearchForm({ cityId, locale }: CitySearchFormProps) {
    const t = useTranslations();
    const localePrefix = locale === routing.defaultLocale ? '' : `/${urlPrefixForLocale(locale)}`;

    return (
        <form
            action={`${localePrefix}/search`}
            method="get"
            role="search"
            className="flex items-center gap-2.5 rounded-xl border border-foreground/60 bg-card py-1.5 pl-4 pr-1.5 shadow-sm focus-within:border-[hsl(var(--orange))] focus-within:ring-[3px] focus-within:ring-[hsl(var(--orange))]/20"
        >
            <input type="hidden" name="cityId" value={cityId} />
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <input
                type="search"
                name="query"
                placeholder={t('City.searchInCity')}
                aria-label={t('City.searchInCity')}
                className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <button
                type="submit"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
                {t('Common.search')}
                <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
        </form>
    );
}
