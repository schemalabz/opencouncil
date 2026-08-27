import { headers } from 'next/headers';
import { Search } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { routing, urlPrefixForLocale, LOCALE_OVERRIDE_HEADER } from '@/i18n/routing';
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
 * to the default locale — except on a realm host, where the prefix is the
 * proxy's and never appears in the URL.
 */
export async function CitySearchForm({ city, subjectCount, locale }: CitySearchFormProps) {
    const t = await getTranslations('cityOverview');
    const tCommon = await getTranslations('Common');
    // On a realm host the proxy rewrites /chania to /fr/chania while the visible
    // URL stays prefix-less, and sets this header when it does. Adding a prefix
    // there moves the visitor into a duplicate prefixed tree that nothing
    // redirects back — so the prefix is only right when the path already has one.
    const rewritten = (await headers()).get(LOCALE_OVERRIDE_HEADER) === locale;
    const localePrefix = locale === routing.defaultLocale || rewritten
        ? ''
        : `/${urlPrefixForLocale(locale)}`;

    const placeholder = t(city.authorityType === 'region' ? 'searchSubjects.region' : 'searchSubjects.municipality', {
        count: subjectCount,
        qualifier: getMunicipalityQualifier(city, locale),
    });

    return (
        <form
            action={`${localePrefix}/search`}
            method="get"
            role="search"
            className="group flex items-center gap-2 rounded-xl border border-border bg-card py-1.5 pl-3.5 pr-1.5 shadow-sm sm:gap-3 sm:pl-4 transition-colors focus-within:border-[hsl(var(--orange))]/70 focus-within:shadow-md hover:border-foreground/25"
        >
            <input type="hidden" name="cityId" value={city.id} />
            {/* One magnifier at a time: below `sm` the submit button carries it, and
                a decorative second one would cost the field 30px it does not have. */}
            <Search className="hidden h-[18px] w-[18px] shrink-0 text-muted-foreground transition-colors group-focus-within:text-[hsl(var(--orange))] sm:block" aria-hidden />
            <input
                type="search"
                name="query"
                placeholder={placeholder}
                aria-label={placeholder}
                // The placeholder names the city and its subject count, which no
                // phone-width field can hold. Ellipsis truncation reads as a long
                // sentence continuing; a hard clip reads as a broken layout.
                className="h-10 min-w-0 flex-1 truncate bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <button
                type="submit"
                aria-label={tCommon('search')}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-[hsl(var(--orange))] text-sm font-medium text-foreground transition-opacity hover:opacity-85 sm:w-auto sm:px-4"
            >
                <Search className="h-[18px] w-[18px] sm:hidden" aria-hidden />
                <span className="hidden sm:inline">{tCommon('search')}</span>
            </button>
        </form>
    );
}
