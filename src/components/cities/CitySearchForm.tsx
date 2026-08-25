import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { routing, urlPrefixForLocale } from '@/i18n/routing';
import { getMunicipalityQualifier } from '@/lib/formatters/name';
import type { CityWithCounts } from '@/lib/db/cities';

interface CitySearchFormProps {
    city: CityWithCounts;
    /** All-time subjects this city has on record — what the field promises to search. */
    subjectCount: number;
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
export function CitySearchForm({ city, subjectCount, locale }: CitySearchFormProps) {
    const t = useTranslations('cityOverview');
    const tCommon = useTranslations('Common');
    const localePrefix = locale === routing.defaultLocale ? '' : `/${urlPrefixForLocale(locale)}`;

    const placeholder = t(city.authorityType === 'region' ? 'searchSubjects.region' : 'searchSubjects.municipality', {
        count: subjectCount,
        qualifier: getMunicipalityQualifier(city, locale),
    });

    return (
        <form
            action={`${localePrefix}/search`}
            method="get"
            role="search"
            className="group flex items-center gap-3 rounded-xl border border-border bg-card py-1.5 pl-4 pr-1.5 shadow-sm transition-colors focus-within:border-[hsl(var(--orange))]/70 focus-within:shadow-md hover:border-foreground/25"
        >
            <input type="hidden" name="cityId" value={city.id} />
            <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground transition-colors group-focus-within:text-[hsl(var(--orange))]" aria-hidden />
            <input
                type="search"
                name="query"
                placeholder={placeholder}
                aria-label={placeholder}
                className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <button
                type="submit"
                className="inline-flex h-10 shrink-0 items-center rounded-[6px] bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
                {tCommon('search')}
            </button>
        </form>
    );
}
