"use client"

import { Fragment, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeText } from '@/lib/utils';
import type { DecisionWithSource } from '@/lib/db/decisions';
import { filterCandidatesByNumber, splitTableRows, type AttentionSubject, type CandidateView } from './attention';
import { ManualEntryForm, type ManualEntry } from './ManualEntryForm';
import { QuietButton } from './controls';

/** Rows shown before the fold. A council agenda runs to sixty items; nobody scans them all. */
export const VISIBLE_ROWS = 12;
const MAX_PICKER_RESULTS = 8;

/** A run of rows under one register label, in the order the meeting sidebar lists them. */
export interface TableSection {
    label: string;
    subjects: AttentionSubject[];
}

interface DecisionsTableProps {
    subtitle: string;
    /** The subjects that can carry a decision. A label shows only when more than one section has rows. */
    sections: TableSection[];
    /** Announcements and questions before the agenda: listed folded, never linked. */
    beforeAgendaSubjects: AttentionSubject[];
    beforeAgendaLabel: string;
    decisions: Record<string, DecisionWithSource>;
    /** Subjects whose question waits in the attention card. */
    proposalSubjectIds: ReadonlySet<string>;
    /** The documents a typed number can match: this meeting's, minus the contested ones. */
    pickableCandidates: CandidateView[];
    query: string;
    cityId: string;
    meetingId: string;
    savingSubjectId: string | null;
    onView: (subject: AttentionSubject, decision: DecisionWithSource) => void;
    onAssign: (candidate: CandidateView, subject: AttentionSubject, replacing: DecisionWithSource | null) => void;
    onManualLink: (subject: AttentionSubject, entry: ManualEntry, replacing: DecisionWithSource | null) => void;
    /** Remove a decision outright, for a wrong link that no document replaces. */
    onUnlink: (subject: AttentionSubject, decision: DecisionWithSource) => void;
    onScrollToAttention: () => void;
    subjectRef: (subject: AttentionSubject) => string;
    /** "Σύνδεση με το θέμα 9", or plain "Σύνδεση" for a subject without a number. */
    linkLabel: (subject: AttentionSubject) => string;
    withdrawnLabel: (subject: AttentionSubject) => string;
}

interface PickerState {
    subjectId: string;
    replacing: DecisionWithSource | null;
    /** The decision the row had when the picker opened; a different one means the answer landed. */
    decisionId: string | null;
    query: string;
    manual: boolean;
}

const decisionNumberOf = (decision: DecisionWithSource) => decision.decisionNumber || decision.protocolNumber || decision.ada || '';

/**
 * The record the clerk knows from the notice board: agenda number, subject,
 * decision number. Rows without a decision take a typed number; rows with
 * one open the document, or change it.
 */
export function DecisionsTable({ subtitle, sections, beforeAgendaSubjects, beforeAgendaLabel, decisions, proposalSubjectIds, pickableCandidates, query, cityId, meetingId, savingSubjectId, onView, onAssign, onManualLink, onUnlink, onScrollToAttention, subjectRef, linkLabel, withdrawnLabel }: DecisionsTableProps) {
    const t = useTranslations('admin.decisionsPage.table');
    const tPicker = useTranslations('admin.decisionsPage.picker');
    const [expanded, setExpanded] = useState(false);
    const [beforeOpen, setBeforeOpen] = useState(false);
    const [picker, setPicker] = useState<PickerState | null>(null);
    // The picker closes itself once its row's decision changes: the link it
    // was opened for is done, whichever path (sheet or form) completed it.
    useEffect(() => {
        if (picker && (decisions[picker.subjectId]?.id ?? null) !== picker.decisionId) setPicker(null);
    }, [decisions, picker]);

    const needle = normalizeText(query.trim());
    const matches = (subject: AttentionSubject): boolean => {
        if (!needle) return true;
        if (normalizeText(subject.name).includes(needle)) return true;
        if (subject.agendaItemTitle && normalizeText(subject.agendaItemTitle).includes(needle)) return true;
        const d = decisions[subject.id];
        return !!d && [d.title, d.ada, d.decisionNumber, d.protocolNumber].some(v => v && normalizeText(v).includes(needle));
    };
    const shownSections = sections
        .map(section => ({ ...section, subjects: section.subjects.filter(matches) }))
        .filter(section => section.subjects.length > 0);
    const labelled = shownSections.length > 1;
    const rows = shownSections.flatMap(section =>
        section.subjects.map((subject, index) => ({ subject, header: labelled && index === 0 ? section.label : null })),
    );
    const { visible, hidden } = splitTableRows(rows, { limit: VISIBLE_ROWS, expanded, searching: needle.length > 0 });
    const hiddenWithoutDecision = hidden.filter(({ subject }) => !subject.withdrawn && !decisions[subject.id]).length;
    const subjectById = new Map(sections.flatMap(section => section.subjects).map(s => [s.id, s]));

    // A legacy decision may carry neither a number nor an ΑΔΑ; it still needs a name in the cell.
    const numberLabel = (decision: DecisionWithSource) => decisionNumberOf(decision) || t('document');

    const openPicker = (subject: AttentionSubject, replacing: DecisionWithSource | null) =>
        setPicker({ subjectId: subject.id, replacing, decisionId: replacing?.id ?? null, query: '', manual: false });

    const renderPicker = (subject: AttentionSubject) => {
        if (!picker || picker.subjectId !== subject.id) return null;
        const pool = filterCandidatesByNumber(pickableCandidates, picker.query);
        const results = pool.slice(0, MAX_PICKER_RESULTS);
        return (
            <div className="pb-3.5 pl-20 pr-5">
                <div className="px-1 pb-1.5 text-xs text-muted-foreground">
                    {picker.replacing
                        ? tPicker('replaceHint', { number: numberLabel(picker.replacing) })
                        : tPicker('hint')}
                </div>
                {results.map(candidate => {
                    const elsewhere = candidate.subjectId && candidate.subjectId !== subject.id ? subjectById.get(candidate.subjectId) : undefined;
                    return (
                        <div key={candidate.id} className="flex min-h-11 items-center gap-3 border-t border-border/60 px-1 text-[13.5px]">
                            <span className="inline-flex h-[22px] shrink-0 items-center rounded-md border bg-muted px-2 text-xs font-semibold tabular-nums">{candidate.decisionNumber || candidate.ada}</span>
                            <span className="min-w-0 flex-1">{candidate.title ?? candidate.ada}</span>
                            {elsewhere && <span className="shrink-0 text-xs text-muted-foreground">{tPicker('foundFor', { subject: subjectRef(elsewhere) })}</span>}
                            <Button size="sm" variant={elsewhere ? 'outline' : 'default'} className="shrink-0" onClick={() => onAssign(candidate, subject, picker.replacing)}>
                                {elsewhere ? tPicker('link') : linkLabel(subject)}
                            </Button>
                        </div>
                    );
                })}
                {picker.query.trim() && results.length === 0 && (
                    <div className="border-t border-border/60 px-1 py-2.5 text-[13px] text-muted-foreground">{tPicker('noResults')}</div>
                )}
                {pool.length > results.length && (
                    <div className="border-t border-border/60 px-1 py-2 text-xs text-muted-foreground">{tPicker('more', { n: pool.length - results.length })}</div>
                )}
                <div className="flex items-center gap-4 px-1 pt-2.5">
                    <QuietButton onClick={() => setPicker(p => p && { ...p, manual: !p.manual })}>{tPicker('notInList')}</QuietButton>
                    {picker.replacing && (
                        <QuietButton onClick={() => onUnlink(subject, picker.replacing as DecisionWithSource)}>{tPicker('remove')}</QuietButton>
                    )}
                    <QuietButton onClick={() => setPicker(null)}>{tPicker('close')}</QuietButton>
                </div>
                {picker.manual && (
                    <div className="mt-3 max-w-xl">
                        <ManualEntryForm
                            cityId={cityId}
                            meetingId={meetingId}
                            subjectId={subject.id}
                            saving={savingSubjectId === subject.id}
                            onSubmit={entry => onManualLink(subject, entry, picker.replacing)}
                        />
                    </div>
                )}
            </div>
        );
    };

    const renderRow = (subject: AttentionSubject) => {
        const decision = decisions[subject.id];
        const pickerOpen = picker?.subjectId === subject.id;
        let cell: React.ReactNode;
        if (pickerOpen) {
            cell = (
                <Input
                    autoFocus
                    value={picker.query}
                    onChange={e => setPicker(p => p && { ...p, query: e.target.value })}
                    placeholder={tPicker('placeholder')}
                    className="h-9 w-[150px] text-sm"
                    inputMode="numeric"
                />
            );
        } else if (subject.withdrawn) {
            cell = <span className="text-xs text-muted-foreground">{withdrawnLabel(subject)}</span>;
        } else if (decision) {
            cell = (
                <>
                    <button
                        type="button"
                        // Nothing hovers on a touch screen, so the control stays visible there.
                        className="text-xs font-medium text-muted-foreground opacity-0 transition-opacity hover:text-foreground hover:underline focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                        onClick={() => openPicker(subject, decision)}
                    >
                        {t('change')}
                    </button>
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 text-sm font-semibold tabular-nums hover:underline"
                        onClick={() => onView(subject, decision)}
                        title={t('openDocument')}
                    >
                        {numberLabel(decision)}
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    </button>
                </>
            );
        } else if (proposalSubjectIds.has(subject.id)) {
            // The answer waits above, but a person who knows a different number must not have to dismiss first.
            cell = (
                <span className="flex flex-col items-end gap-0.5 py-1.5">
                    <QuietButton onClick={onScrollToAttention}>{t('waitingAbove')}</QuietButton>
                    <QuietButton onClick={() => openPicker(subject, null)}>{t('fillNumber')}</QuietButton>
                </span>
            );
        } else {
            cell = <QuietButton onClick={() => openPicker(subject, null)}>{t('fillNumber')}</QuietButton>;
        }
        return (
            <Fragment key={subject.id}>
                <div id={`subject-row-${subject.id}`} className="group grid min-h-[46px] grid-cols-[44px_minmax(0,1fr)_210px] items-center gap-4 border-t border-border/60 px-5 text-sm">
                    <span className="text-[13px] tabular-nums text-muted-foreground">{subject.agendaItemIndex ?? ''}</span>
                    <span className={`min-w-0 py-2.5 leading-snug ${subject.withdrawn ? 'text-muted-foreground' : ''}`}>{subject.name}</span>
                    <span className="flex items-center justify-end gap-3 whitespace-nowrap">{cell}</span>
                </div>
                {renderPicker(subject)}
            </Fragment>
        );
    };

    return (
        <section className="overflow-hidden rounded-2xl border border-foreground/15 bg-card">
            <div className="flex items-baseline justify-between gap-4 px-5 pb-3 pt-4">
                <h2 className="text-[15px] font-semibold">{t('title')}</h2>
                <span className="text-xs text-muted-foreground">{subtitle}</span>
            </div>
            <div className="grid min-h-[34px] grid-cols-[44px_minmax(0,1fr)_210px] items-center gap-4 border-t bg-muted/40 px-5 text-xs font-semibold text-muted-foreground">
                <span>{t('colIndex')}</span>
                <span>{t('colSubject')}</span>
                <span className="text-right">{t('colNumber')}</span>
            </div>

            {!needle && beforeAgendaSubjects.length > 0 && (
                <>
                    <button
                        type="button"
                        onClick={() => setBeforeOpen(o => !o)}
                        className="grid min-h-[40px] w-full grid-cols-[44px_minmax(0,1fr)_210px] items-center gap-4 border-t border-border/60 px-5 text-left text-[13px]"
                        aria-expanded={beforeOpen}
                    >
                        <span />
                        <span className="flex items-center gap-2 text-muted-foreground">
                            {beforeOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {t('beforeAgenda', { label: beforeAgendaLabel, n: beforeAgendaSubjects.length })}
                        </span>
                        <span className="text-right text-xs text-muted-foreground">{t('noDecision')}</span>
                    </button>
                    {beforeOpen && beforeAgendaSubjects.map(subject => (
                        <div key={subject.id} className="grid min-h-[38px] grid-cols-[44px_minmax(0,1fr)_210px] items-center gap-4 border-t border-border/60 px-5 text-[13px] text-muted-foreground">
                            <span />
                            <span className="min-w-0 py-2 pl-[22px] leading-snug">{subject.name}</span>
                            <span />
                        </div>
                    ))}
                </>
            )}

            {visible.map(({ subject, header }) => (
                <Fragment key={subject.id}>
                    {header && (
                        <div className="border-t border-border/60 px-5 pb-1 pt-3 text-xs font-semibold text-muted-foreground">{header}</div>
                    )}
                    {renderRow(subject)}
                </Fragment>
            ))}

            {rows.length === 0 && (
                <div className="border-t px-5 py-8 text-center text-sm text-muted-foreground">{t('empty')}</div>
            )}

            {hidden.length > 0 && (
                <button type="button" onClick={() => setExpanded(true)} className="flex w-full items-center justify-center gap-2 border-t px-5 py-3.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                    {t('showRest', { n: hidden.length })}
                    {hiddenWithoutDecision > 0 && <span>· {t('showRestMissing', { n: hiddenWithoutDecision })}</span>}
                    <ChevronDown className="h-3.5 w-3.5" />
                </button>
            )}
            {expanded && rows.length > VISIBLE_ROWS && !needle && (
                <button type="button" onClick={() => setExpanded(false)} className="flex w-full items-center justify-center gap-2 border-t px-5 py-3.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
                    {t('showLess')}
                </button>
            )}
        </section>
    );
}
