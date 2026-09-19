"use client";

import { Fragment, useLayoutEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { getWithdrawnLabel, sectionHeadingAt, type RecordSection } from '@/lib/utils/subjects';
import type { ResultKey } from '@/lib/utils/decisionResult';
import { QuietButton } from '@/components/meetings/decisions/controls';
import { Chip } from '@/components/meetings/decisions/RecordRow';

/** How many rows show before the fold. */
export const VISIBLE_ROWS = 12;

/** A dash means "nothing to show here", never "nothing happened". */
const DASH = '—';

/**
 * The grid every header cell and every row cell share, so columns line up —
 * from `md` up only.
 *
 * 44 + 150 + 210 and three 16px gaps is 452px of fixed width before the Θέμα
 * column gets a pixel. A phone's card is 351px wide, where the same grid
 * resolved to `44px 0px 150px 210px`: the title collapsed to nothing and ran
 * over the result, and the Αρ. απόφασης column ran off the card with no
 * horizontal scroll to reach it. `md` is the first width at which all four
 * columns and a readable title fit.
 */
const ROW_GRID = 'md:grid md:grid-cols-[44px_minmax(0,1fr)_150px_210px] md:gap-4';

/**
 * Below `md` a row is a two-line block instead: the title on the first line,
 * led by its agenda number from inside its own text, and the decision number
 * opposite the result on the second. The cells keep their
 * document order, so the `order-*` utilities on them move nothing at `md`,
 * where `md:order-none` hands placement back to the grid.
 */
const ROW_STACK = 'flex flex-wrap gap-x-2 gap-y-1';

/** What a row wears at every width: stacked, then the grid from `md` up. */
const ROW_LAYOUT = `${ROW_STACK} ${ROW_GRID} px-5`;

/**
 * Ends the stacked row's first line. A flex item with a full-width basis is
 * the only thing that forces a wrap where the content itself would not: a
 * short title leaves room for the number line beside it, and the row then
 * reads as one run-on line.
 *
 * Takes the `order-*` of the line it ends, so it stays between the right two
 * items wherever the stacked reading differs from document order.
 */
const StackBreak = ({ order }: { order?: string }) => (
    <div role="presentation" className={cn('basis-full md:hidden', order)} />
);

/**
 * A register heading: a band across the whole card, opening at the same left
 * padding as the Α/Α column. Indented to the Θέμα column instead, it read as a
 * caption on the first row under it rather than as a line between two blocks.
 *
 * `-mt-px` lays the band's own rule over the bottom border of the row above it,
 * so the two 1px lines do not stack into one 2px line.
 */
const SECTION_HEADING =
    '-mt-px border-t border-border/60 px-5 pb-1 pt-3 text-[12px] font-semibold text-muted-foreground';

/** The reference row metric: one line of the clerk's table, centred in it. */
const ROW_HEIGHT = 'min-h-[46px] items-center';

/**
 * A cell a row has nothing to put in. Stacked it would still take its share
 * of the gap and indent the line it sits on; in the grid it has to stay, or
 * every cell after it moves one column left.
 *
 * Hidden it also left the a11y tree, and a screen reader then read the row's
 * remaining cells against the wrong column labels. Clipped instead, it draws
 * nothing and takes no space, and the row still answers one cell per label.
 */
const EMPTY_CELL = 'sr-only md:not-sr-only';

/**
 * The Α/Α column, which exists only from `md` up: stacked, `SubjectTitle`
 * carries the number inline instead, so nothing here holds a line of its own.
 *
 * The label and every cell of that column wear this together. A `role="table"`
 * maps a cell to a label by position, so the column has to leave the a11y tree
 * whole — a hidden cell under a label that stayed would shift every label on
 * the row by one.
 */
const INDEX_COLUMN = 'hidden md:block';

export interface TableRow {
    subject: { id: string; name: string; agendaItemIndex: number | null; nonAgendaReason: string | null; withdrawn: boolean };
    decision: { number: string; manualBy: string | null } | null;
    result: ResultKey;
    /** Why this row shows a dash, when the dash needs explaining. */
    resultHint: string | null;
    /** The counts behind the result word — "8 υπέρ, 1 κατά" — shown when the
     * row is hovered. Null for a row whose document records no vote. */
    voteCounts: string | null;
    proposal: { candidateId: string; number: string; title: string | null; likely: boolean } | null;
    /** Set for a short while after "Όχι", so the answer can be taken back. */
    rejected: { candidateId: string; number: string } | null;
}

export interface DecisionsTableProps {
    rows: TableRow[];
    beforeAgenda: { id: string; name: string }[];
    filter: 'all' | 'missing';
    missingCount: number;
    onFilterChange: (f: 'all' | 'missing') => void;
    openPanelSubjectId: string | null;
    onOpenPanel: (subjectId: string, mode: 'link' | 'change') => void;
    renderPanel: (subjectId: string) => ReactNode;
    onAcceptProposal: (subjectId: string, candidateId: string) => void;
    onRejectProposal: (subjectId: string, candidateId: string) => void;
    onUndoReject: (subjectId: string, candidateId: string) => void;
    onOpenDecision: (subjectId: string) => void;
    onOpenProposalDocument: (candidateId: string) => void;
    busySubjectId: string | null;
}

type T = ReturnType<typeof useTranslations>;

const RESULT_MUTED: ResultKey[] = ['withdrawn', 'none', 'noVote'];

/**
 * The counts under the result word: the row's own quiet companion, revealed on
 * hover the way the Αρ. απόφασης cell reveals «Αλλαγή».
 *
 * Where a pointer hovers, the counts sit out of flow, so the word stays the
 * cell's only flow content. In flow the counts made the cell two lines tall
 * even while hidden, and a cell centred on two lines put the word above the
 * row's optical centre — visibly higher than the decision number beside it, on
 * every un-hovered row. Only the opacity changes, so nothing mounts under the
 * pointer.
 *
 * `leading-none` is what keeps the revealed line inside the shortest row: a
 * one-line row is 46px tall, and the word's line box ends about 33px down it.
 *
 * Nothing hovers on a touch screen, so there the counts are always on screen —
 * and therefore in flow, where they add their own line to the row. Out of flow
 * they added no height, so on consecutive rows they overlapped the row below
 * and spilled out of the column.
 *
 * Below `md` the same holds whatever the pointer is: the stacked row has no
 * Αποτέλεσμα column for an out-of-flow line to sit under, so the counts stay
 * in flow and stay visible, under the result word they belong to.
 */
const VOTE_COUNTS =
    'block whitespace-nowrap text-[11px] leading-none text-muted-foreground'
    + ' md:[@media(hover:hover)]:absolute md:[@media(hover:hover)]:left-0 md:[@media(hover:hover)]:top-full'
    + ' md:[@media(hover:hover)]:opacity-0 md:[@media(hover:hover)]:group-hover:opacity-100';

/**
 * «Αλλαγή»: the Αρ. απόφασης cell's own quiet companion, revealed on hover the
 * way the vote counts opposite it are — and hidden from `md` up by the same
 * rule, so the two reveal together under one pointer.
 *
 * Below `md` it takes the counts' treatment exactly: in flow, always on
 * screen, one size down and muted. The row's second line then reads as one
 * pair — the change action under the number on the left, the counts under the
 * result word on the right — instead of a link shouting beside a whisper.
 *
 * `md:leading-[inherit]` rather than a named line height: the desktop row is
 * measured, and any value of its own here would move the number off the
 * optical centre it shares with the result word.
 */
const CHANGE_ACTION =
    'text-[11px] leading-none md:text-[13px] md:leading-[inherit]'
    + ' md:[@media(hover:hover)]:opacity-0 md:[@media(hover:hover)]:group-hover:opacity-100';

/**
 * Literal message keys for every non-withdrawn `ResultKey`. The
 * `Record<Exclude<ResultKey, 'withdrawn'>, string>` type is what keeps this
 * map complete: TypeScript rejects the map if a union member has no value,
 * so it grows whenever `ResultKey` grows.
 *
 * `t(RESULT_MESSAGE_KEY[row.result])` passes a dynamic property lookup to
 * `t`, not a string literal, so this is not a `table.result.${row.result}`
 * interpolation — the "every computed group is registered in
 * COMPUTED_GROUPS" guard never triggers on it. That also means the five
 * strings in this map are not literal calls the repo's key scanner
 * (`translation-key-references.test.ts`) can read, unlike `Subject.categories.`.
 * A typo in one of them is caught by nothing; only the `Record` type above
 * guarantees every member gets a key at all.
 */
const RESULT_MESSAGE_KEY: Record<Exclude<ResultKey, 'withdrawn'>, string> = {
    unanimous: 'table.result.unanimous',
    majority: 'table.result.majority',
    rejected: 'table.result.rejected',
    none: 'table.result.none',
    noVote: 'table.result.noVote',
};

/**
 * The Αποτέλεσμα cell: the one word a posted Πίνακας αποφάσεων carries, with
 * the counts behind it kept out of the way until the row is hovered.
 */
function ResultCell({ row, t, tSubject }: { row: TableRow; t: T; tSubject: T }) {
    return (
        <span className="relative block">
            <span
                className={cn(
                    'text-[13px]',
                    RESULT_MUTED.includes(row.result) ? 'text-muted-foreground' : 'text-foreground font-medium',
                    row.resultHint && 'cursor-help border-b border-dotted border-muted-foreground/50',
                )}
                title={row.resultHint ?? undefined}
            >
                {row.result === 'withdrawn'
                    ? getWithdrawnLabel(tSubject, row.subject)
                    : t(RESULT_MESSAGE_KEY[row.result])}
            </span>
            {row.voteCounts && <span className={VOTE_COUNTS}>{row.voteCounts}</span>}
        </span>
    );
}

/**
 * The line under a subject's name when the resolver already proposed a
 * decision for it — the whole point of state 3β is that the row itself
 * carries the question, so the person never has to open a panel to see it.
 */
function ProposalLine({
    proposal,
    onOpenProposalDocument,
    t,
}: {
    proposal: NonNullable<TableRow['proposal']>;
    onOpenProposalDocument: (candidateId: string) => void;
    t: T;
}) {
    // Document order is the one line this reads as from `md` up. Below it the
    // line has to break into three — the question, the decision it found, the
    // answer — and the mark belongs with the question, not after the title it
    // follows here. The `order-*` numbers are that stacked reading; every one
    // of them is off at `md`, where document order stands again.
    return (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
            <span className="order-1 md:order-none">{t('table.foundLikely')}</span>
            <StackBreak order="order-3" />
            <Chip className="order-4 md:order-none">{proposal.number}</Chip>
            {/* Capped, so a long title cannot stretch the row's only tall cell;
                the native tooltip is where the rest of it stays readable. */}
            {proposal.title && (
                <span className="order-5 max-w-[300px] truncate md:order-none" title={proposal.title}>{proposal.title}</span>
            )}
            <StackBreak order="order-6" />
            {proposal.likely && <span className="order-2 font-semibold text-green-700 md:order-none">{t('attention.likelyMatch')}</span>}
            <QuietButton className="order-7 md:order-none" onClick={() => onOpenProposalDocument(proposal.candidateId)}>{t('table.openDocument')}</QuietButton>
        </div>
    );
}

/**
 * Whether the element the returned ref holds has more text than it shows.
 *
 * Measured, never counted: three clamped lines hold about 90 characters of a
 * Greek title in the desktop column and about 40 on a phone, so no length of
 * string answers this. `scrollHeight` over `clientHeight` is the only thing
 * that knows, and the observer asks it again whenever the column resizes.
 *
 * `active` is false while the text is expanded, where the clamp is off and
 * every title measures as fitting. The node arrives through state rather than
 * a ref object so that swapping the tag — plain text for a button, the very
 * thing this answer decides — re-runs the effect on the new element instead of
 * leaving the observer on the discarded one.
 */
function useClamped(active: boolean, text: string) {
    const [node, setNode] = useState<HTMLElement | null>(null);
    const [clamped, setClamped] = useState(false);
    useLayoutEffect(() => {
        if (!node || !active) return;
        // A fractional line height leaves `scrollHeight` a pixel over on text
        // that fits; a hidden line is a whole line taller than that.
        const measure = () => setClamped(node.scrollHeight - node.clientHeight > 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [node, active, text]);
    return { setNode, clamped };
}

/**
 * The subject's own words, cut to three lines at every width.
 *
 * A real agenda title can run to eight or nine lines — on a phone one of them
 * fills the whole screen, and the table stops being a table a clerk can read
 * down. Three lines is the cut, not a mobile-only cut: one rule is one
 * decision, and the desktop column is no better off with nine.
 *
 * A button, but only on a title the clamp actually cuts: the hover tooltip
 * hands the rest of the text back on a pointer device, and a touch screen has
 * no hover, so the tap has to. The button is what makes that reachable by
 * keyboard too, and `aria-expanded` is what says which of the two states it is
 * in. A title that fits in three lines has nothing to reveal, so it stays
 * plain text — a control that answers a click with nothing is worse than no
 * control.
 *
 * Below `md` the agenda number leads the title from inside this text flow,
 * where the Α/Α column no longer exists to carry it. Inline, and inside the
 * clamp: beside the clamped block it would cost a fourth line, and on its own
 * line it would cost one on every row of a thirty-row table. The full stop is
 * what makes a bare digit read as a list marker rather than as the first word
 * of the sentence after it.
 */
function SubjectTitle({ name, index, muted }: { name: string; index: number | null; muted: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const { setNode, clamped } = useClamped(!expanded, name);
    const className = cn(
        'block w-full text-left text-[14px]',
        muted ? 'text-muted-foreground' : 'text-foreground',
        !expanded && 'line-clamp-3',
    );
    const content = (
        <>
            {/* No `tabular-nums` here, unlike the Α/Α cell: a figure-width
                advance on a single digit left a gap before the full stop, and
                there is no column of digits under this one to align it to. */}
            {index !== null && <span className="mr-1 text-muted-foreground md:hidden">{index}.</span>}
            {name}
        </>
    );

    // The tooltip stays on both: a pointer device gets the full text without a
    // click either way, and the two tags then differ only in what a click and
    // a Tab do.
    if (!clamped) {
        return <div ref={setNode} title={name} className={className}>{content}</div>;
    }
    return (
        <button
            type="button"
            ref={setNode}
            aria-expanded={expanded}
            title={name}
            onClick={() => setExpanded(open => !open)}
            className={className}
        >
            {content}
        </button>
    );
}

/**
 * The Αρ. απόφασης cell: one of five states a row can be in (canvas
 * 1–3γ, 12, 14). A withdrawn subject never gets a "fill in a number" offer —
 * there is nothing left for it to decide.
 */
function NumberCell({
    row,
    busy,
    onOpenPanel,
    onOpenDecision,
    onAcceptProposal,
    onRejectProposal,
    onUndoReject,
    t,
}: {
    row: TableRow;
    busy: boolean;
    onOpenPanel: (subjectId: string, mode: 'link' | 'change') => void;
    onOpenDecision: (subjectId: string) => void;
    onAcceptProposal: (subjectId: string, candidateId: string) => void;
    onRejectProposal: (subjectId: string, candidateId: string) => void;
    onUndoReject: (subjectId: string, candidateId: string) => void;
    t: T;
}) {
    const { subject, decision, proposal, rejected } = row;

    // The dash fills the column where there is a column to fill. The stacked
    // row has none: a lone dash under a withdrawn title reads as an answer
    // the row is still waiting for, when the row is already finished.
    if (subject.withdrawn) {
        return <span className="hidden text-[13px] text-muted-foreground md:inline">{DASH}</span>;
    }

    // The row carries the `group` class, not this cell: «Αλλαγή» and the vote
    // counts then reveal together under one pointer, not one cell at a time.
    //
    // `flex-col-reverse` below `md` is what puts the number on the top line
    // without moving it ahead of «Αλλαγή» in the document, where the desktop
    // row wants it second — to the right of the action, on one line.
    if (decision) {
        return (
            <div className="flex flex-col-reverse items-start md:flex-row md:items-center md:gap-2">
                <QuietButton
                    className={CHANGE_ACTION}
                    disabled={busy}
                    onClick={() => onOpenPanel(subject.id, 'change')}
                >
                    {t('table.change')}
                </QuietButton>
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[13px] font-semibold tabular-nums"
                    title={decision.manualBy ? t('table.manualBy', { name: decision.manualBy }) : undefined}
                    onClick={() => onOpenDecision(subject.id)}
                >
                    {decision.manualBy ? <UserIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                    {decision.number}
                </button>
            </div>
        );
    }

    if (proposal) {
        return (
            <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onRejectProposal(subject.id, proposal.candidateId)}>
                    {t('table.reject')}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => onAcceptProposal(subject.id, proposal.candidateId)}>
                    {t('table.accept')}
                </Button>
            </div>
        );
    }

    if (rejected) {
        return (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span>{t('table.rejected', { number: rejected.number })}</span>
                <QuietButton onClick={() => onUndoReject(subject.id, rejected.candidateId)}>{t('table.undo')}</QuietButton>
            </div>
        );
    }

    return (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenPanel(subject.id, 'link')}>
            {t('table.fillNumber')}
        </Button>
    );
}

function FilterChip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                // The pill has a fixed height: a label that wraps to a second
                // line inside it spills out of the pill instead of growing it.
                'inline-flex h-[30px] items-center whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors',
                active ? 'bg-foreground text-background' : 'border border-foreground/15 text-foreground hover:bg-muted',
            )}
        >
            {children}
        </button>
    );
}

/**
 * The Πίνακας αποφάσεων itself: one row per agenda item, ordered the way the
 * clerk's own posted table is — number, subject, result, decision number.
 *
 * The table filters and folds its own `rows`; the page only decides which
 * rows exist and what each one currently means. A "Χωρίς απόφαση" row is any
 * row whose `result` is `'none'` — the same fact `resultKey` used to decide
 * there was nothing to link yet, so the filter and the dash never disagree
 * about which rows are outstanding.
 */
export function DecisionsTable({
    rows,
    beforeAgenda,
    filter,
    missingCount,
    onFilterChange,
    openPanelSubjectId,
    onOpenPanel,
    renderPanel,
    onAcceptProposal,
    onRejectProposal,
    onUndoReject,
    onOpenDecision,
    onOpenProposalDocument,
    busySubjectId,
}: DecisionsTableProps) {
    const t = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');
    const [expanded, setExpanded] = useState(false);

    const filteredRows = filter === 'missing' ? rows.filter(r => r.result === 'none') : rows;
    const effectiveExpanded = expanded || filter === 'missing' || filteredRows.length <= VISIBLE_ROWS;
    const visibleRows = effectiveExpanded ? filteredRows : filteredRows.slice(0, VISIBLE_ROWS);
    const hiddenRows = effectiveExpanded ? [] : filteredRows.slice(VISIBLE_ROWS);
    const hiddenMissing = hiddenRows.filter(r => r.result === 'none').length;
    const hiddenWithdrawn = hiddenRows.filter(r => r.result === 'withdrawn').length;

    // A section heading only earns its place when the table actually mixes
    // both registers — a meeting with only agenda items needs no label
    // telling it apart from a register that has no rows here.
    const hasOutOfAgenda = filteredRows.some(r => r.subject.nonAgendaReason === 'outOfAgenda');
    const hasAgenda = filteredRows.some(r => r.subject.nonAgendaReason !== 'outOfAgenda');
    const showSectionHeadings = hasOutOfAgenda && hasAgenda;
    const subjectsForHeadings = visibleRows.map(r => r.subject);

    const showBeforeAgendaRow = filter === 'all' && beforeAgenda.length > 0;
    const nothingToShow = filteredRows.length === 0 && !showBeforeAgendaRow;

    const showRestLabel = [
        t('table.showRest', { n: hiddenRows.length }),
        ...(hiddenMissing > 0 ? [t('table.showRestMissing', { n: hiddenMissing })] : []),
        ...(hiddenWithdrawn > 0 ? [t('table.showRestWithdrawn', { n: hiddenWithdrawn })] : []),
    ].join(' · ');

    return (
        <section className={cn(surfaceCardClass, 'overflow-hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/10 px-5 py-4">
                <h2 className="text-[15px] font-semibold">{t('table.title')}</h2>
                {missingCount > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <FilterChip active={filter === 'all'} onClick={() => onFilterChange('all')}>
                            {t('table.filterAll')}
                        </FilterChip>
                        <FilterChip active={filter === 'missing'} onClick={() => onFilterChange('missing')}>
                            {t('table.filterMissing')}
                            <span
                                className={cn(
                                    'ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                                    filter === 'missing' ? 'bg-background/20' : 'bg-foreground/10',
                                )}
                            >
                                {missingCount}
                            </span>
                        </FilterChip>
                    </div>
                )}
            </div>

            <div role="table" aria-label={t('table.title')}>
                {/* Column labels for the columns that exist. A stacked row
                    draws none, so below `md` the header is clipped rather than
                    hidden: the values under it are the same values, and a
                    screen reader reading them needs the labels at every width.
                    The padding wears `md:` because `md:not-sr-only` zeroes
                    padding and margin, and an unprefixed `px-5` is emitted
                    before every `md:` rule, so the reset would win over it. */}
                <div role="row" className={cn(ROW_GRID, 'sr-only items-center border-b border-foreground/10 text-[11px] font-medium text-muted-foreground md:not-sr-only md:px-5 md:py-2')}>
                    <div role="columnheader" className={INDEX_COLUMN}>{t('table.colIndex')}</div>
                    <div role="columnheader">{t('table.colSubject')}</div>
                    <div role="columnheader">{t('table.colResult')}</div>
                    <div role="columnheader" className="text-right">{t('table.colNumber')}</div>
                </div>

                {showBeforeAgendaRow && (
                    <div role="row" className={cn(ROW_LAYOUT, ROW_HEIGHT, 'border-b border-foreground/5 py-2')}>
                        <div role="cell" className={INDEX_COLUMN} />
                        <div role="cell" className="grow text-[14px] text-muted-foreground">
                            {t('table.beforeAgenda', { n: beforeAgenda.length })}
                        </div>
                        <StackBreak />
                        <div role="cell" className={EMPTY_CELL} />
                        <div role="cell" className="ml-auto text-right text-[13px] text-muted-foreground md:ml-0">{t('table.noDecision')}</div>
                    </div>
                )}

                {visibleRows.map((row, i) => {
                    const heading: RecordSection | null = showSectionHeadings ? sectionHeadingAt(subjectsForHeadings, i) : null;
                    const busy = busySubjectId === row.subject.id;
                    const { proposal } = row;
                    return (
                        <Fragment key={row.subject.id}>
                            {heading && (
                                <div role="presentation" className={SECTION_HEADING}>
                                    {t(heading === 'agenda' ? 'table.sectionAgenda' : 'table.sectionOutOfAgenda')}
                                </div>
                            )}
                            <div
                                role="row"
                                className={cn(
                                    ROW_LAYOUT,
                                    // Every cell centres against the row's tallest one, which is
                                    // always the Θέμα cell: a real agenda title runs to eight or
                                    // nine lines, and `items-start` stranded the Α/Α number, the
                                    // result and the decision number up at its first line.
                                    'group items-center border-b border-foreground/5 py-3',
                                    proposal && 'bg-amber-50',
                                )}
                            >
                                <div role="cell" className={cn(INDEX_COLUMN, 'text-[13px] tabular-nums text-muted-foreground')}>
                                    {row.subject.agendaItemIndex ?? ''}
                                </div>
                                <div role="cell" className="min-w-0 grow">
                                    <SubjectTitle
                                        name={row.subject.name}
                                        index={row.subject.agendaItemIndex}
                                        muted={row.subject.withdrawn}
                                    />
                                    {proposal && (
                                        <ProposalLine proposal={proposal} onOpenProposalDocument={onOpenProposalDocument} t={t} />
                                    )}
                                </div>
                                <StackBreak />
                                <div role="cell" className="order-4 text-right md:order-none md:text-left">
                                    <ResultCell row={row} t={t} tSubject={tSubject} />
                                </div>
                                <div role="cell" className="order-3 flex grow justify-start md:order-none md:justify-end">
                                    <NumberCell
                                        row={row}
                                        busy={busy}
                                        onOpenPanel={onOpenPanel}
                                        onOpenDecision={onOpenDecision}
                                        onAcceptProposal={onAcceptProposal}
                                        onRejectProposal={onRejectProposal}
                                        onUndoReject={onUndoReject}
                                        t={t}
                                    />
                                </div>
                            </div>
                            {openPanelSubjectId === row.subject.id && (
                                <div role="presentation">{renderPanel(row.subject.id)}</div>
                            )}
                        </Fragment>
                    );
                })}
            </div>

            {nothingToShow && (
                <div className="px-5 py-8 text-center text-[13px] text-muted-foreground">{t('table.empty')}</div>
            )}

            {!effectiveExpanded && hiddenRows.length > 0 && (
                <div className="px-5 py-3">
                    {/* A button centres its own text. This label names three
                        things and takes two lines on a phone, where the second
                        line then sat centred under the first. */}
                    <QuietButton className="text-left" onClick={() => setExpanded(true)}>{showRestLabel}</QuietButton>
                </div>
            )}
            {expanded && filter === 'all' && filteredRows.length > VISIBLE_ROWS && (
                <div className="px-5 py-3">
                    <QuietButton onClick={() => setExpanded(false)}>{t('table.showLess')}</QuietButton>
                </div>
            )}
        </section>
    );
}
