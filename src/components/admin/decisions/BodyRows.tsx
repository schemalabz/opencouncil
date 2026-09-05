"use client";

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BadgePicker } from '@/components/ui/badge-picker';
import type { BodyDecisionHealth, CityDecisionHealth } from '@/lib/db/decisionHealth';
import { diavgeiaSearchUrl } from '@/components/meetings/decisions/pdfUrl';
import { parseDiavgeiaUnitScope } from '@/lib/utils/diavgeiaUnitScope';
import { CoverageStrip } from './CoverageStrip';
import { QueueBadges } from './QueueBadges';
import { ROW_GRID } from './rowLayout';

/** Which body is selected; `bodyId: null` is the no-body bucket. */
export type BodySelection = { bodyId: string | null };

/** The picker value of the no-body bucket; body ids are cuids, so it cannot collide. */
const NO_BODY_VALUE = 'none';
const pickerValue = (row: BodyDecisionHealth) => row.body?.id ?? NO_BODY_VALUE;

const isSelected = (row: BodyDecisionHealth, selected: BodySelection | null) =>
    selected !== null && (row.body?.id ?? null) === selected.bodyId;

/**
 * The bodies of one city, progressively: the app's badge picker (name, config
 * marker, queue badges) filters the expansion, and behind a toggle the full
 * sub-rows on the city row's column grid show the city's numbers as the sum
 * of theirs.
 */
export function BodyRows({ city, selected, onSelect }: {
    city: CityDecisionHealth;
    selected: BodySelection | null;
    onSelect: (selection: BodySelection | null) => void;
}) {
    const t = useTranslations('admin.decisionsOverview');
    const locale = useLocale();
    const [details, setDetails] = useState(false);
    const bodyLabel = (row: BodyDecisionHealth) =>
        row.body === null ? t('bodies.noBody') : (locale === 'el' ? row.body.name : row.body.name_en);
    const toggleRow = (row: BodyDecisionHealth) =>
        onSelect(isSelected(row, selected) ? null : { bodyId: row.body?.id ?? null });

    return (
        <div className="mb-3">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <BadgePicker
                    options={city.bodies.map(row => ({
                        value: pickerValue(row),
                        label: bodyLabel(row),
                        hint: (active: boolean) => (
                            <>
                                {(row.body?.diavgeiaUnitIds.length ?? 0) === 0 && (
                                    <TriangleAlert className="h-3 w-3 shrink-0 opacity-70" aria-label={t('bodies.orgWide')} />
                                )}
                                <QueueBadges queues={row} empty={null} inheritColor={active} />
                            </>
                        ),
                    }))}
                    selectedValues={selected === null ? [] : [selected.bodyId ?? NO_BODY_VALUE]}
                    onSelectionChange={values => onSelect(values.length === 0 ? null : { bodyId: values[0] === NO_BODY_VALUE ? null : values[0] })}
                    allLabel={t('bodies.all')}
                    collapsible={false}
                />
                <button type="button" onClick={() => setDetails(!details)} aria-expanded={details}
                    className="flex h-7 items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground">
                    {details ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                    {t('bodies.details')}
                </button>
            </div>
            {details && (
                // -mx-4 undoes the expansion's padding, so the sub-rows sit on the city row's grid.
                <div className="-mx-4 mt-2">
                    {city.bodies.map(row => {
                        const active = isSelected(row, selected);
                        return (
                            <div key={row.body?.id ?? 'none'}
                                data-state={active ? 'selected' : undefined}
                                onClick={() => toggleRow(row)}
                                className={`grid w-full ${ROW_GRID} cursor-pointer items-center gap-2 px-1 py-1.5 sm:gap-3 ${active ? 'bg-muted' : 'hover:bg-muted/40'}`}>
                                <span />
                                <span className="flex min-w-0 flex-col pl-3">
                                    {/* The row is the pointer target; the button is the keyboard one. */}
                                    <button type="button" aria-pressed={active} title={bodyLabel(row)}
                                        onClick={e => { e.stopPropagation(); toggleRow(row); }}
                                        className={`truncate text-left text-sm ${active ? 'font-semibold' : ''}`}>
                                        {bodyLabel(row)}
                                    </button>
                                    <ConfigLine row={row} organizationUid={city.diavgeiaUid} />
                                </span>
                                <span className="flex min-w-0 flex-col gap-1">
                                    {row.eligibleSubjects === 0 ? (
                                        <span className="text-xs text-muted-foreground">{t('bodies.noMeetingsInRange')}</span>
                                    ) : (
                                        <>
                                            <span className="text-sm tabular-nums">
                                                <b>{row.linkedSubjects.toLocaleString(locale)}</b>
                                                <span className="text-muted-foreground"> / {row.eligibleSubjects.toLocaleString(locale)}</span>
                                            </span>
                                            <CoverageStrip content={row.contentLinks} linked={row.linkedSubjects} eligible={row.eligibleSubjects} />
                                        </>
                                    )}
                                </span>
                                <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">
                                    {row.eligibleSubjects > 0 && `${row.polledMeetings} / ${row.meetings}`}
                                </span>
                                <span className="flex items-center justify-end gap-3 text-xs tabular-nums">
                                    <QueueBadges queues={row} />
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/**
 * The body's Diavgeia config under its name: each unit entry linking to the
 * portal search it scopes, or the organization-wide marker (with its tooltip
 * for real bodies).
 */
function ConfigLine({ row, organizationUid }: { row: BodyDecisionHealth; organizationUid: string | null }) {
    const t = useTranslations('admin.decisionsOverview');
    const units = row.body?.diavgeiaUnitIds ?? [];
    if (units.length > 0) {
        return (
            <span className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10px] text-muted-foreground">
                {units.map(u => {
                    // The same parser the poll uses, so a malformed entry shows as text here, not as a wrong link.
                    let scope = null;
                    try { scope = parseDiavgeiaUnitScope(u); } catch { scope = null; }
                    return organizationUid && scope ? (
                        <a key={u} href={diavgeiaSearchUrl(organizationUid, scope)} target="_blank" rel="noopener noreferrer"
                            title={t('bodies.openInDiavgeia')} onClick={e => e.stopPropagation()} className="hover:text-foreground hover:underline">
                            {u}
                        </a>
                    ) : <span key={u} className={scope ? undefined : 'text-red-700 dark:text-red-500'}>{u}</span>;
                })}
            </span>
        );
    }
    const marker = (
        <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <TriangleAlert className="h-3 w-3" aria-hidden />{t('bodies.orgWide')}
        </span>
    );
    if (row.body === null) return marker;
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    {/* The row toggles the body filter; opening the tooltip must not. */}
                    <button type="button" onClick={e => e.stopPropagation()} className="w-fit text-left">{marker}</button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 text-xs">{t('bodies.orgWideExplain')}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
