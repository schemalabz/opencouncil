"use client";

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { CalendarX2, Inbox, Info, Swords } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CityDecisionHealth } from '@/lib/db/decisionHealth';
import { cityState } from '@/lib/db/decisionHealthState';
import { convergenceTotals, sortCities } from './convergence';
import { CityRow, type OpenRequest } from './CityRow';
import { CoverageStrip } from './CoverageStrip';

/**
 * The decisions overview: subjects converging with Diavgeia documents, then one
 * row per city sorted by how badly a human is needed. Everything below a row
 * loads on expansion; all actions except conflict resolution link out to the
 * per-meeting decisions page.
 */
export type OverviewRange = '30' | '90' | 'all';

export function DecisionsOverview({ cities, range }: { cities: CityDecisionHealth[]; range: OverviewRange }) {
    const t = useTranslations('admin.decisionsOverview');
    const locale = useLocale();
    const totals = convergenceTotals(cities);
    const realUnplaced = totals.unplaced - totals.unplacedUnread;
    /** Set by the hero queue lines: which city to expand, on which filter. */
    const [openRequest, setOpenRequest] = useState<(OpenRequest & { cityId: string }) | null>(null);

    const inScope = cities.filter(c => c.inScope);
    const active = sortCities(inScope.filter(c => cityState(c) !== 'notStarted'));
    const notStarted = inScope.filter(c => cityState(c) === 'notStarted');
    const outOfScope = cities.filter(c => !c.inScope);
    const cityLabel = (c: CityDecisionHealth) => (locale === 'el' ? c.cityName : c.cityNameEn);

    return (
        <div className="mx-auto max-w-5xl px-4 py-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold">{t('title')}</h1>
                    <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <nav className="flex rounded-lg border p-0.5 text-xs">
                        {(['30', '90', 'all'] as const).map(w => (
                            <Link
                                key={w}
                                href={w === '30' ? '/admin/decisions' : `/admin/decisions?window=${w}`}
                                className={`rounded-md px-2.5 py-1 ${range === w ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {t(w === 'all' ? 'window.all' : `window.d${w}`)}
                            </Link>
                        ))}
                    </nav>
                    <InfoTip text={t('window.note')} />
                </div>
            </div>

            {/* Ratio + queues: the coverage ratio is the page's one big
                number; the queues on the right are the counters that should
                read zero. Same visual grammar as a city row, totaled. */}
            <div className="mt-8 flex flex-wrap items-start justify-between gap-x-16 gap-y-6">
                <div className="max-w-md flex-1 basis-72">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-4xl font-light tabular-nums">{totals.linkedSubjects.toLocaleString(locale)}</span>
                        <span className="text-2xl font-light tabular-nums text-muted-foreground">/ {totals.eligibleSubjects.toLocaleString(locale)}</span>
                        <span className="text-sm text-muted-foreground">{t('hero.withDecision')}</span>
                    </div>
                    <CoverageStrip className="mt-3 h-1.5" content={totals.contentLinks} linked={totals.linkedSubjects} eligible={totals.eligibleSubjects} />
                    <dl className="mt-3 space-y-1 text-sm">
                        <div className="flex items-baseline justify-between gap-6">
                            <dt className="text-muted-foreground"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-600" aria-hidden />{t('hero.withContent')}</dt>
                            <dd className="font-semibold tabular-nums text-green-700 dark:text-green-400">{totals.contentLinks.toLocaleString(locale)}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-6">
                            <dt className="text-muted-foreground"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-muted" aria-hidden />{t('hero.withoutDecision')}</dt>
                            <dd className="font-semibold tabular-nums">{totals.withoutDecision.toLocaleString(locale)}</dd>
                        </div>
                    </dl>
                </div>
                <div className="min-w-52">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('hero.pending')}</h2>
                    {(() => {
                        // The icons double as the legend for the city-row badges,
                        // and each line jumps to the first city carrying that queue.
                        const queues = [
                            { key: 'conflicts', Icon: Swords, filter: 'conflicts' as const, count: totals.conflicts, cls: 'text-amber-600 dark:text-amber-500', tip: null, has: (c: CityDecisionHealth) => c.conflicts > 0 },
                            { key: 'unplaced', Icon: Inbox, filter: 'unplaced' as const, count: realUnplaced, cls: '', tip: null, has: (c: CityDecisionHealth) => c.unplacedCandidates - c.unplacedUnread > 0 },
                            { key: 'unplaceable', Icon: CalendarX2, filter: 'noSession' as const, count: totals.unplaceable, cls: '', tip: t('hero.unplaceableExplain'), has: (c: CityDecisionHealth) => c.unplaceable.total > 0 },
                        ].filter(q => q.count > 0);
                        return queues.length === 0 ? (
                            <p className="mt-3 text-sm text-muted-foreground">{t('hero.nonePending')}</p>
                        ) : (
                            <dl className="mt-3 space-y-1.5 text-sm">
                                {queues.map(q => (
                                    <div key={q.key} className="flex items-baseline justify-between gap-8">
                                        <dt className="flex items-center gap-1.5 text-muted-foreground">
                                            <q.Icon className="h-3.5 w-3.5 text-amber-700 dark:text-amber-500" aria-hidden />
                                            <button type="button" className="hover:text-foreground hover:underline"
                                                onClick={() => {
                                                    const target = active.find(q.has);
                                                    if (target) setOpenRequest({ cityId: target.cityId, filter: q.filter });
                                                }}>
                                                {t(`hero.${q.key}`)}
                                            </button>
                                            {q.tip && <InfoTip text={q.tip} />}
                                        </dt>
                                        <dd className={`font-semibold tabular-nums ${q.cls}`}>{q.count.toLocaleString(locale)}</dd>
                                    </div>
                                ))}
                            </dl>
                        );
                    })()}
                </div>
            </div>
            {/* Cities */}
            <section className="mt-10">
                <h2 className="border-b pb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('cities.title')}</h2>
                <div>
                    {active.map(c => (
                        <CityRow key={c.cityId} city={c} state={cityState(c)} label={cityLabel(c)}
                            openRequest={openRequest?.cityId === c.cityId ? openRequest : null} />
                    ))}
                </div>
            </section>

            {(notStarted.length > 0 || outOfScope.length > 0) && (
                <div className="mt-8 space-y-2 border-t pt-4 text-sm text-muted-foreground">
                    {notStarted.length > 0 && (
                        <p>
                            <span className="mr-2 text-xs font-semibold uppercase tracking-widest">{t('cities.notStarted')}: </span>
                            {notStarted.map(c => `${cityLabel(c)} (${t('taxonomy.subjectCount', { count: c.eligibleSubjects })})`).join(' · ')}
                        </p>
                    )}
                    {outOfScope.length > 0 && (
                        <p>
                            <span className="mr-2 text-xs font-semibold uppercase tracking-widest">{t('cities.outOfScope')}: </span>
                            {outOfScope.map(cityLabel).join(' · ')} — {t('cities.outOfScopeReason')}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/** Keyboard- and touch-reachable explanation, unlike a bare title attribute. */
function InfoTip({ text }: { text: string }) {
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground/70 hover:text-foreground" aria-label={text}>
                        <Info className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-xs">{text}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
