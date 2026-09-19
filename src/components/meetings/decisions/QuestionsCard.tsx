"use client";

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { ANSWER_ROW, ANSWER_ROW_TEXT, QuietButton } from '@/components/meetings/decisions/controls';
import { Chip, RecordRow } from '@/components/meetings/decisions/RecordRow';
import { DiavgeiaFooter, type DiavgeiaFooterState } from '@/components/meetings/decisions/DiavgeiaFooter';
import type { WorkEstimate } from '@/components/meetings/decisions/candidates';
import type { ReadDiavgeiaUnitEntry } from '@/lib/utils/diavgeiaUnitScope';

export interface Receipt {
    id: string;
    text: string;
    /** The decision `text` names, when the page can still show it. The
     * identifier becomes a control rather than inert type, so a decision set
     * aside stays inspectable — and undoable — from its own receipt. */
    open?: { label: string; onOpen: () => void };
    /** Omitted when the API gives no way back (e.g. a manual write already gone). */
    undo?: () => void;
}

/**
 * A receipt's sentence, with the decision it names turned into a control.
 *
 * The identifier is located inside the translated sentence rather than
 * composed around it, so each locale keeps one sentence to translate. A
 * sentence that does not contain the identifier renders whole and inert: a
 * receipt the reader can still read beats a receipt assembled wrong.
 */
function ReceiptSentence({ receipt, t }: { receipt: Receipt; t: ReturnType<typeof useTranslations> }) {
    const at = receipt.open ? receipt.text.indexOf(receipt.open.label) : -1;
    if (!receipt.open || at === -1) return <>{receipt.text}</>;
    const { label, onOpen } = receipt.open;
    return (
        <>
            {receipt.text.slice(0, at)}
            <QuietButton onClick={onOpen} aria-label={t('attention.openDecisionFor', { number: label })}>
                {label}
            </QuietButton>
            {receipt.text.slice(at + label.length)}
        </>
    );
}

export interface QuestionsCardProps {
    /** Subjects with no decision yet, split by what answering them takes. */
    waiting: { proposed: number; plain: number } | null;
    onJumpToTable: () => void;
    conflicts: {
        candidateId: string;
        number: string;
        title: string | null;
        /** `hasAgendaNumber` picks the button's copy: a numbered subject fits
         * "Μένει σ{subject}" on one line, a named one does not (see the
         * render below), so it falls back to a plain outcome word. */
        holder: { id: string; label: string; hasAgendaNumber: boolean };
        claimant: { id: string; label: string; hasAgendaNumber: boolean } | null;
    }[];
    unplaced: { candidateId: string; number: string; title: string | null; publishedOn: string }[];
    /** The unmatched item whose subject picker is open, if any. */
    pickerCandidateId: string | null;
    renderPicker: (candidateId: string) => ReactNode;
    receipts: Receipt[];
    estimate: WorkEstimate;
    /** Everything the card counts: waiting subjects + conflicts + unplaced decisions. */
    total: number;
    loadFailed: boolean;
    onRetryLoad: () => void;
    diavgeiaUid: string | null;
    pollScope: ReadDiavgeiaUnitEntry[];
    /** The last poll's date, already formatted, or null when none has run. */
    lastCheck: string | null;
    pollState: DiavgeiaFooterState;
    onPoll: () => void;
    /** A check this page already asked for is on its way. */
    polling: boolean;
    onOpenDocument: (candidateId: string) => void;
    onOpenPicker: (candidateId: string) => void;
    onDismiss: (candidateId: string) => void;
    onKeepHolder: (candidateId: string) => void;
    onMoveToClaimant: (candidateId: string) => void;
    busyCandidateId: string | null;
}

/**
 * "Χρειάζονται μια ματιά" — everything on this meeting's decisions that a
 * subject's own table row can't answer: a decision unmatched to any subject,
 * or claimed by two. Subjects waiting on an answer stay countable here but
 * are answered in the table itself (the design's "one item, one place" rule)
 * — this card only counts them and links to the table.
 *
 * With nothing outstanding the card collapses to its Diavgeia footer alone.
 * A heading, a badge reading zero and a green "all clear" sentence were three
 * ways of saying there is nothing to do, above a table that already showed it.
 * A receipt still renders, so the undo for the answer that emptied the card
 * does not vanish with the question it answered.
 *
 * `loadFailed` keeps the card open even when `total` is zero: a failed load
 * and a finished meeting look identical otherwise.
 */
export function QuestionsCard({
    waiting,
    onJumpToTable,
    conflicts,
    unplaced,
    pickerCandidateId,
    renderPicker,
    receipts,
    estimate,
    total,
    loadFailed,
    onRetryLoad,
    diavgeiaUid,
    pollScope,
    lastCheck,
    pollState,
    onPoll,
    polling,
    onOpenDocument,
    onOpenPicker,
    onDismiss,
    onKeepHolder,
    onMoveToClaimant,
    busyCandidateId,
}: QuestionsCardProps) {
    const t = useTranslations('admin.decisionsPage');
    const [unplacedOpen, setUnplacedOpen] = useState(false);

    const noQuestions = total === 0 && !loadFailed;
    const waitingCount = waiting ? waiting.proposed + waiting.plain : 0;

    return (
        <section className={cn(surfaceCardClass, 'overflow-hidden')}>
            {loadFailed && (
                <div className={cn(ANSWER_ROW, 'items-center border-b border-destructive/30 bg-destructive/5 px-5 py-3 text-sm')}>
                    <span className={cn(ANSWER_ROW_TEXT, 'flex items-center gap-2 text-destructive')}>
                        <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-hidden />
                        {t('status.loadFailed')}
                    </span>
                    <Button variant="outline" size="sm" className="shrink-0" onClick={onRetryLoad}>{t('status.retry')}</Button>
                </div>
            )}

            {!noQuestions && (
                <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                    <h2 className="text-[15px] font-semibold">{t('attention.title')}</h2>
                    <Badge variant="outline">{total}</Badge>
                    {/* Opposite the title and the count, not trailing them: the
                        estimate answers "how long will this take me", which is a
                        different question from "what is here". */}
                    <span className="ml-auto text-xs text-muted-foreground">
                        {estimate.kind === 'underMinute'
                            ? t('attention.estimateUnderMinute')
                            : t('attention.estimateMinutes', { minutes: estimate.minutes })}
                    </span>
                </div>
            )}

            {/* With the heading gone the list has nothing above it, so it
                supplies the padding the heading's row used to leave. */}
            {receipts.length > 0 && (
                <ul className={cn('space-y-1 px-5 pb-3', noQuestions && 'pt-3')}>
                    {receipts.map(receipt => (
                        <li key={receipt.id} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" aria-hidden />
                            <span className="flex-1"><ReceiptSentence receipt={receipt} t={t} /></span>
                            {receipt.undo && (
                                <QuietButton onClick={receipt.undo} aria-label={t('attention.undoFor', { text: receipt.text })}>
                                    {t('attention.undo')}
                                </QuietButton>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {!noQuestions && (
                <>
                    {waiting && waitingCount > 0 && (
                        <div className="border-t border-border/60 px-5 py-3">
                            <button type="button" onClick={onJumpToTable} className="block w-full text-left">
                                <p className="text-sm font-medium">{t('waiting.title', { n: waitingCount })}</p>
                                <p className="mt-0.5 text-[13px] text-muted-foreground">
                                    {waiting.proposed > 0 && t('waiting.proposedClause', { p: waiting.proposed })}
                                    {waiting.proposed > 0 && waiting.plain > 0 && ' '}
                                    {waiting.plain > 0 && t('waiting.plainClause', { q: waiting.plain })}
                                </p>
                                <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-primary underline underline-offset-[3px]">
                                    {t('waiting.jump')}
                                    <ArrowRight className="h-3 w-3" aria-hidden />
                                </span>
                            </button>
                        </div>
                    )}

                    {conflicts.length > 0 && (
                        <ul className="space-y-2 border-t border-border/60 px-5 py-3">
                            {conflicts.map(conflict => {
                                const busy = busyCandidateId === conflict.candidateId;
                                return (
                                    <li key={conflict.candidateId} className="space-y-1.5 rounded-lg border border-border/60 bg-background px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <Chip>{conflict.number}</Chip>
                                            <span className="min-w-0 flex-1 truncate text-sm" title={conflict.title ?? undefined}>{conflict.title}</span>
                                            <QuietButton
                                                onClick={() => onOpenDocument(conflict.candidateId)}
                                                disabled={busy}
                                                aria-label={t('attention.openDocumentFor', { number: conflict.number })}
                                            >
                                                {t('attention.openDocument')}
                                            </QuietButton>
                                        </div>
                                        <p className="text-[13px] text-muted-foreground">
                                            {t('attention.whichSubject')}{' '}
                                            <span className="text-foreground">{conflict.holder.label}</span> — {t('attention.holderNow')}
                                            {conflict.claimant && (
                                                <>
                                                    {' · '}
                                                    <span className="text-foreground">{conflict.claimant.label}</span> — {t('attention.claimant')}
                                                </>
                                            )}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button size="sm" variant="outline" disabled={busy} onClick={() => onKeepHolder(conflict.candidateId)}>
                                                {busy
                                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                                    : conflict.holder.hasAgendaNumber
                                                        ? t('attention.keepAsIs', { subject: conflict.holder.label })
                                                        : t('attention.keepAsIsPlain')}
                                            </Button>
                                            {conflict.claimant && (
                                                <Button size="sm" variant="default" disabled={busy} onClick={() => onMoveToClaimant(conflict.candidateId)}>
                                                    {busy
                                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                                        : conflict.claimant.hasAgendaNumber
                                                            ? t('attention.moveTo', { subject: conflict.claimant.label })
                                                            : t('attention.moveToPlain')}
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}

                    {unplaced.length > 0 && (
                        <div className="border-t border-border/60 px-5 py-3">
                            <div className={cn(ANSWER_ROW, 'items-start')}>
                                <div className={ANSWER_ROW_TEXT}>
                                    <p className="text-sm font-medium">{t('unplaced.title', { n: unplaced.length })}</p>
                                    <p className="mt-0.5 max-w-xl text-[13px] text-muted-foreground">{t('unplaced.hint')}</p>
                                </div>
                                <QuietButton className="shrink-0" onClick={() => setUnplacedOpen(open => !open)} aria-expanded={unplacedOpen}>
                                    {unplacedOpen ? t('attention.hide') : t('attention.show')}
                                </QuietButton>
                            </div>
                            {unplacedOpen && (
                                <ul className="mt-2 space-y-1.5">
                                    {unplaced.map(item => {
                                        const busy = busyCandidateId === item.candidateId;
                                        const pickerOpen = pickerCandidateId === item.candidateId;
                                        return (
                                            <li key={item.candidateId}>
                                                {/* The same row the decision picker offers, so
                                                    picking a subject for a decision and picking a
                                                    decision for a subject read as one thing: the
                                                    date on the muted second line, «Άνοιγμα» — the
                                                    short label, since the row already says what
                                                    opens — beside the one action, and the second
                                                    answer under it. */}
                                                <RecordRow
                                                    lead={<Chip>{item.number}</Chip>}
                                                    title={item.title}
                                                    meta={t('attention.publishedOn', { date: item.publishedOn })}
                                                    open={(
                                                        <QuietButton
                                                            onClick={() => onOpenDocument(item.candidateId)}
                                                            disabled={busy}
                                                            aria-label={t('attention.openDocumentFor', { number: item.number })}
                                                        >
                                                            {t('panel.open')}
                                                        </QuietButton>
                                                    )}
                                                    action={pickerOpen ? null : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={busy}
                                                            onClick={() => onOpenPicker(item.candidateId)}
                                                            aria-label={t('attention.chooseSubjectFor', { number: item.number })}
                                                        >
                                                            {t('attention.chooseSubject')}
                                                        </Button>
                                                    )}
                                                    secondary={pickerOpen ? null : (
                                                        <QuietButton
                                                            // Quieter than the action beside it, and deliberately not
                                                            // destructive-red: this only sets `dismissedAt`, so the
                                                            // decision keeps everything and can be restored.
                                                            className="text-[11px]"
                                                            onClick={() => onDismiss(item.candidateId)}
                                                            disabled={busy}
                                                            aria-label={t('attention.notThisMeetingFor', { number: item.number })}
                                                        >
                                                            {t('attention.notThisMeeting')}
                                                        </QuietButton>
                                                    )}
                                                    footer={pickerOpen ? renderPicker(item.candidateId) : undefined}
                                                />
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}
                </>
            )}

            <DiavgeiaFooter
                diavgeiaUid={diavgeiaUid}
                pollScope={pollScope}
                lastCheck={lastCheck}
                pollState={pollState}
                onPoll={onPoll}
                polling={polling}
                dividerAbove={!noQuestions || receipts.length > 0}
            />
        </section>
    );
}
