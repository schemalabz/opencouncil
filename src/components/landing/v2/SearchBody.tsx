'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, MapPin, Landmark } from 'lucide-react';
import type { Topic } from '@prisma/client';
import { cn } from '@/lib/utils';
import Icon from '@/components/icon';
import { Eyebrow } from './shared';
import { contrastText } from './conceptShared';
import { type LandingCity, type LandingSubject, type QueryKind } from './landingData';
import { PetitionCta } from './MunicipalitiesList';
import { BODY_TYPES, DURATION_FILTERS, EMPTY_FILTERS, toggleValue, type MapFilters } from './landingCore';
import { CityAvatar } from './controls';
import { useSearchMatches } from './hooks/useSearchMatches';

/* Popular searches are the most-repeated real queries (from the SearchQuery log), fetched
   once and shared between the desktop dropdown and the mobile overlay. We keep the curated
   SEARCH_KEYWORDS as the default/fallback so the chips are never empty and stay sensible
   until there's enough search history. */
let popularCache: string[] | null = null;
let popularPromise: Promise<string[]> | null = null;

function usePopularSearches(): string[] {
    const t = useTranslations('landingV2');
    const fallback = t.raw('popularSearches') as string[];
    const [keywords, setKeywords] = useState<string[]>(popularCache ?? fallback);
    useEffect(() => {
        if (popularCache) return;
        if (!popularPromise) {
            popularPromise = fetch('/api/landing/popular-searches')
                .then((r) => (r.ok ? r.json() : { keywords: [] }))
                .then((d: { keywords: string[] }) => {
                    // Need a few to read as intentional; otherwise keep the curated list.
                    popularCache = d.keywords.length >= 4 ? d.keywords : fallback;
                    return popularCache;
                })
                .catch(() => {
                    popularCache = fallback;
                    return popularCache;
                });
        }
        let active = true;
        void popularPromise.then((k) => active && setKeywords(k));
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return keywords;
}

/* native date input with a Greek placeholder. Browsers localise the date field from the
   browser UI language (not the element `lang`), so when the field is empty we hide the
   native text and overlay "ηη/μμ/εεεε"; focusing restores the native edit fields. */
function DateField({
    value,
    min,
    max,
    onChange,
}: {
    value: string | null;
    min?: string;
    max?: string;
    onChange: (v: string | null) => void;
}) {
    const t = useTranslations('landingV2');
    return (
        <div className="relative mt-1">
            <input
                type="date"
                lang="el"
                value={value ?? ''}
                min={min}
                max={max}
                onChange={(e) => onChange(e.target.value || null)}
                className={cn(
                    'peer h-9 w-full min-w-0 rounded-lg border border-border bg-background px-1.5 text-xs text-foreground sm:px-2 sm:text-sm',
                    !value && 'text-transparent focus:text-foreground',
                )}
            />
            {!value && (
                <span className="pointer-events-none absolute inset-y-0 left-1.5 flex items-center text-xs text-muted-foreground/70 peer-focus:hidden sm:left-2 sm:text-sm">
                    {t('search.datePlaceholder')}
                </span>
            )}
        </div>
    );
}

/* Search dropdown / overlay body — identical on desktop and mobile. While typing it shows
   the actionable options (apply category, filter by δήμος, petition, fly to address) and the
   matching subjects; idle it shows the popular searches + the category/δήμος/όργανο/διάρκεια/
   ημερομηνία filters. The query interpretation lives in useSearchMatches. */
export function SearchBody({
    topics,
    cities,
    cats,
    filters,
    onFiltersChange,
    onPickKeyword,
    onToggleCat,
    onClearCats,
    query,
    queryKind,
    results,
    onPickResult,
    onLocateAddress,
}: {
    topics: Topic[];
    cities: LandingCity[];
    /** the currently-selected category ids (empty means "all") — for the active badge state */
    cats: string[];
    filters: MapFilters;
    onFiltersChange: (next: MapFilters) => void;
    /** a popular search was chosen → fill the search bar with it */
    onPickKeyword: (keyword: string) => void;
    onToggleCat: (topicId: string) => void;
    onClearCats: () => void;
    query: string;
    queryKind: QueryKind;
    /** subject matches for the current query (title/address) */
    results: LandingSubject[];
    onPickResult: (id: string) => void;
    /** geocode the query as an address and fly there (also closes the dropdown) */
    onLocateAddress: (q: string) => void;
}) {
    const t = useTranslations('landingV2');
    const popularSearches = usePopularSearches();
    const { unknownMunicipality, matchedTopic, knownMunicipality, showAddressOption, dateActive, anyFilterActive } = useSearchMatches({
        query,
        queryKind,
        cities,
        topics,
        cats,
        filters,
    });

    // While typing, replace the default suggestions/filters with the matching subjects.
    if (query.trim()) {
        return (
            <>
                {unknownMunicipality && (
                    <div className="mb-3">
                        <PetitionCta unknownName={unknownMunicipality} />
                    </div>
                )}
                {matchedTopic && (
                    <button
                        type="button"
                        onClick={() => onToggleCat(matchedTopic.id)}
                        className="mb-3 flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-foreground/30"
                    >
                        <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${matchedTopic.colorHex}1a` }}
                        >
                            <Icon name={matchedTopic.icon || 'hash'} color={matchedTopic.colorHex} size={14} />
                        </span>
                        <span className="min-w-0 flex-1 text-muted-foreground">
                            {t('search.filterCategory')}{' '}
                            <span className="font-semibold text-foreground">{matchedTopic.name}</span>
                        </span>
                    </button>
                )}
                {knownMunicipality && (
                    <button
                        type="button"
                        onClick={() => onFiltersChange({ ...filters, cityIds: [knownMunicipality.cityId] })}
                        className="mb-3 flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-foreground/30"
                    >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70">
                            <Landmark className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 text-muted-foreground">
                            {t('search.filterMunicipality')}{' '}
                            <span className="font-semibold text-foreground">{knownMunicipality.nameMunicipality}</span>
                        </span>
                    </button>
                )}
                {showAddressOption && (
                    <button
                        type="button"
                        onClick={() => onLocateAddress(query)}
                        className="mb-3 flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-foreground/30"
                    >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--orange))]/10 text-[hsl(var(--orange))]">
                            <MapPin className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 text-muted-foreground">
                            {t('search.subjectsNearAddress')}{' '}
                            <span className="font-semibold text-foreground">“{query.trim()}”</span>
                        </span>
                    </button>
                )}
                {results.length === 0 ? (
                    unknownMunicipality || matchedTopic || knownMunicipality || showAddressOption ? null : (
                        <div className="py-6 text-center text-sm text-muted-foreground">{t('search.noResults')}</div>
                    )
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {results.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => onPickResult(s.id)}
                                className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted"
                            >
                                <span
                                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                                    style={{ backgroundColor: `${s.topic.color}1a` }}
                                >
                                    <Icon name={s.topic.icon || 'hash'} color={s.topic.color} size={14} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="line-clamp-2 text-[14px] font-medium leading-snug text-foreground">
                                        {s.title}
                                    </span>
                                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                        <MapPin className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{s.where || s.cityName}</span>
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </>
        );
    }

    return (
        <>
            {anyFilterActive && (
                <button
                    type="button"
                    onClick={() => {
                        onClearCats();
                        onFiltersChange(EMPTY_FILTERS);
                    }}
                    className="mb-4 flex w-full items-center justify-center rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                    {t('common.clearAll')}
                </button>
            )}
            <Eyebrow className="block">{t('search.popular')}</Eyebrow>
            <div className="mt-2.5 flex flex-wrap gap-2">
                {popularSearches.map((k) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => onPickKeyword(k)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30"
                    >
                        <Search className="h-3.5 w-3.5" /> {k}
                    </button>
                ))}
            </div>

            <div className="mt-7 flex items-center justify-between">
                <Eyebrow className="block">{t('search.categories')}</Eyebrow>
                {cats.length > 0 && (
                    <button
                        type="button"
                        onClick={onClearCats}
                        className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                    >
                        {t('common.clear')}
                    </button>
                )}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
                {topics.map((t) => {
                    const active = cats.includes(t.id);
                    return (
                        <button
                            key={t.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onToggleCat(t.id)}
                            // idle: the subject-card TopicChip look (tinted bg); selected: solid fill
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold transition-colors"
                            style={
                                active
                                    ? { backgroundColor: t.colorHex, borderColor: t.colorHex, color: contrastText(t.colorHex) }
                                    : { backgroundColor: `${t.colorHex}1a`, borderColor: `${t.colorHex}38`, color: t.colorHex }
                            }
                        >
                            <Icon name={t.icon || 'hash'} color={active ? contrastText(t.colorHex) : t.colorHex} size={14} />
                            {t.name}
                        </button>
                    );
                })}
            </div>

            <span data-filter="municipalities" />
            <div className="mt-7 flex items-center justify-between">
                <Eyebrow className="block">{t('search.municipalities')}</Eyebrow>
                {filters.cityIds.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onFiltersChange({ ...filters, cityIds: [] })}
                        className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                    >
                        {t('common.clear')}
                    </button>
                )}
            </div>
            <div className="mt-2.5 flex flex-col gap-0.5">
                {cities.map((c) => {
                    const checked = filters.cityIds.includes(c.id);
                    return (
                        <button
                            key={c.id}
                            type="button"
                            aria-pressed={checked}
                            // single-select: choosing a municipality replaces any other
                            onClick={() => onFiltersChange({ ...filters, cityIds: checked ? [] : [c.id] })}
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-muted"
                        >
                            {/* squared selector — no checkmark; selected shows an inset black square */}
                            <span
                                aria-hidden
                                className={cn(
                                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                                    checked ? 'border-foreground' : 'border-muted-foreground/40',
                                )}
                            >
                                {checked && <span className="h-2 w-2 rounded-[2px] bg-foreground" />}
                            </span>
                            <CityAvatar city={c} />
                            <span className="flex-1 text-[15px] font-medium text-foreground">{c.name}</span>
                        </button>
                    );
                })}
            </div>

            <span data-filter="bodytype" />
            <Eyebrow className="mt-7 block">{t('search.body')}</Eyebrow>
            <div className="mt-2.5 flex flex-wrap gap-2">
                {BODY_TYPES.map((b) => {
                    const active = filters.bodyTypes.includes(b.key);
                    return (
                        <button
                            key={b.key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onFiltersChange({ ...filters, bodyTypes: toggleValue(filters.bodyTypes, b.key) })}
                            className={cn(
                                'h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                                active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background text-foreground hover:border-foreground/30',
                            )}
                        >
                            {t(`bodyType.${b.key}`)}
                        </button>
                    );
                })}
            </div>

            <span data-filter="duration" />
            <Eyebrow className="mt-7 block">{t('search.duration')}</Eyebrow>
            <div className="mt-2.5 flex flex-wrap gap-2">
                {DURATION_FILTERS.map((d) => {
                    const active = (filters.minDuration ?? null) === d.minMinutes;
                    return (
                        <button
                            key={d.key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onFiltersChange({ ...filters, minDuration: d.minMinutes })}
                            className={cn(
                                'h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
                                active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-background text-foreground hover:border-foreground/30',
                            )}
                        >
                            {t(`duration.${d.key}`)}
                        </button>
                    );
                })}
            </div>

            <span data-filter="dates" />
            <div className="mt-7 flex items-center justify-between">
                <Eyebrow className="block">{t('search.dateRange')}</Eyebrow>
                {dateActive && (
                    <button
                        type="button"
                        onClick={() => onFiltersChange({ ...filters, dateFrom: null, dateTo: null })}
                        className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
                    >
                        {t('common.clear')}
                    </button>
                )}
            </div>
            <div className="mt-2.5 flex items-end gap-2">
                <label className="min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">{t('search.from')}</span>
                    <DateField
                        value={filters.dateFrom}
                        max={filters.dateTo ?? undefined}
                        onChange={(v) => onFiltersChange({ ...filters, dateFrom: v })}
                    />
                </label>
                <label className="min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">{t('search.to')}</span>
                    <DateField
                        value={filters.dateTo}
                        min={filters.dateFrom ?? undefined}
                        onChange={(v) => onFiltersChange({ ...filters, dateTo: v })}
                    />
                </label>
            </div>
            {dateActive && (
                <p className="pt-1.5 text-xs text-muted-foreground">
                    {t('search.datesOverride')}
                </p>
            )}
        </>
    );
}
