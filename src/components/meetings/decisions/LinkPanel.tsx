"use client";

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatCalendarDate } from '@/lib/formatters/time';
import type { RowCandidate } from '@/components/meetings/decisions/rowCandidates';
import { ANSWER_ROW, PANEL_SHELL, PANEL_TABLE_INDENT, QuietButton } from '@/components/meetings/decisions/controls';
import { Chip, RecordRow } from '@/components/meetings/decisions/RecordRow';

/** How many rows the list shows before «Εμφάνιση όλων». */
const LIST_LIMIT = 8;

/** What a row in the panel's list needs about the decision itself. */
export interface PanelCandidate {
    id: string;
    decisionNumber: string | null;
    title: string | null;
    ada: string;
    publishDate: string | null;
}

/** What a row needs about the other subject involved, when there is one. */
export interface PanelSubject {
    id: string;
    label: string;
}

/**
 * A write the panel will not send until the page confirms it. `replace` is
 * never asked for from inside this component — see the note on `onLink`
 * below — but it still needs to render once the page asks for it.
 */
export type PanelConfirm =
    | { kind: 'replace'; candidateId: string; current: { number: string; reversible: boolean } }
    | { kind: 'move'; candidateId: string; from: string }
    | { kind: 'unlink'; current: { number: string; reversible: boolean } };

export interface LinkPanelProps {
    /**
     * Always begins with the Greek article «το»: `"το θέμα 30"` for an
     * agenda item, `"το θέμα «Πληρεξουσιότητα Τακόπουλου»"` for a subject
     * with no agenda number. The Greek copy contracts «σε» with that
     * article (`σ{subjectLabel}`), so a label that starts any other way
     * produces ungrammatical Greek.
     */
    subjectLabel: string;
    /** `hasAgendaNumber` picks the copy for the confirm strip's move action,
     * which would otherwise interpolate `subjectLabel`: a numbered subject
     * fits "Μεταφορά στο θέμα 30" on one line, a named one does not, so it
     * falls back to a plain outcome word instead. */
    hasAgendaNumber: boolean;
    current: {
        /** The linked decision's own id, which `onOpenDocument` takes as well
         * as a candidate id — the sheet resolves either. */
        id: string;
        number: string;
        title: string | null;
        reversible: boolean;
    } | null;
    /**
     * The caller keeps a pending candidate's row in `rows` until its
     * confirmation resolves — the confirm strip looks up the incoming
     * candidate's number here, and removing the row early would silently
     * drop that number from the strip.
     */
    rows: RowCandidate<PanelCandidate, PanelSubject>[];
    query: string;
    onQueryChange: (q: string) => void;
    confirm: PanelConfirm | null;
    onAskConfirm: (c: PanelConfirm) => void;
    onCancelConfirm: () => void;
    onConfirm: (c: PanelConfirm) => void;
    /**
     * A free or proposed candidate was picked. Called directly, with no
     * confirmation, even when `current` is set — a row already holding a
     * decision would need to turn this into a `replace` confirmation, but
     * that call is the page's to make (it owns `confirm`), not this
     * component's: the page is what decided a row already has something to
     * lose in the first place.
     */
    onLink: (candidateId: string) => void;
    /** How many decisions the row could take before any search:
     * `rowCandidates(…, query: '').length`. Zero opens the panel on the ΑΔΑ
     * step, and hides the way back to a list that would be empty. */
    offerableCount: number;
    /** The ΑΔΑ step. The page renders it, because the page owns the poll that
     * answers it. `onBack` is `null` when there is no list to go back to.
     * Null when the meeting takes no decisions: no search can find one. */
    renderAdaStep: ((args: { noCandidates: boolean; onBack: (() => void) | null; onManual: () => void; onClose: () => void }) => ReactNode) | null;
    /** The step that adds a decision by hand, for one Diavgeia does not have.
     * `onBack` is `null` when there is neither a list nor an ΑΔΑ step to go back to. */
    renderManualStep: (args: { onBack: (() => void) | null; toAda: () => void; onClose: () => void }) => ReactNode;
    onOpenDocument: (documentId: string) => void;
    onClose: () => void;
    saving: boolean;
    /** The cause of the last failed write, already said in the reader's language.
     * The strip pairs it with the fixed "nothing changed" note. */
    error: string | null;
    /** Sends the failed write again. */
    onRetry: () => void;
}

/**
 * The panel that opens under a row to link, change, or remove its decision.
 *
 * The row above it never changes shape while this is open, so the clerk
 * always sees which subject they are answering for. Anything that only adds
 * — linking a free decision, taking an unanswered proposal — commits on
 * click. Anything that removes something a person can see elsewhere —
 * moving a decision off another row, unlinking one here — stops at a
 * one-line confirmation first, so a click never empties a row nobody is
 * looking at. `confirm` is state the page owns: this component only asks
 * for it or renders it, never both at once.
 */
export function LinkPanel({
    subjectLabel,
    hasAgendaNumber,
    current,
    rows,
    query,
    onQueryChange,
    confirm,
    onAskConfirm,
    onCancelConfirm,
    onConfirm,
    onLink,
    offerableCount,
    renderAdaStep,
    renderManualStep,
    onOpenDocument,
    onClose,
    saving,
    error,
    onRetry,
}: LinkPanelProps) {
    const t = useTranslations('admin.decisionsPage');
    const locale = useLocale();
    // The first step follows the data: with nothing to pick, a list would be
    // an empty box above a search field that filters nothing.
    const [step, setStep] = useState<'list' | 'ada' | 'manual'>(offerableCount > 0 ? 'list' : renderAdaStep ? 'ada' : 'manual');
    const [showAll, setShowAll] = useState(false);
    // Which row's button was pressed, so only that one shows the spinner —
    // `saving` alone can't tell rows apart, and disabling every row without
    // marking the one actually in flight reads as the click did nothing.
    const [pendingId, setPendingId] = useState<string | null>(null);

    const handleLink = (id: string) => {
        setPendingId(id);
        onLink(id);
    };

    // The confirmation strip names the decision by number, but `confirm`
    // itself only carries the candidate id — the number lives on the row
    // that proposed the write, still present in `rows`.
    const candidateNumber = (id: string): string | null => {
        const row = rows.find(r => r.candidate.id === id);
        return row ? (row.candidate.decisionNumber ?? row.candidate.ada) : null;
    };

    if (confirm !== null) {
        const sentence = confirm.kind === 'replace'
            ? (confirm.current.reversible
                ? t('panel.replaceNote', { number: confirm.current.number })
                : t('panel.replaceNoteDestructive', { number: confirm.current.number }))
            : confirm.kind === 'move'
                ? t('panel.moveNote', { from: confirm.from, subject: subjectLabel })
                : (confirm.current.reversible
                    ? t('panel.unlinkNote', { subject: subjectLabel, number: confirm.current.number })
                    : t('panel.unlinkNoteDestructive', { number: confirm.current.number }));

        const actionLabel = confirm.kind === 'replace'
            ? t('panel.replaceAction')
            : confirm.kind === 'move'
                ? (hasAgendaNumber ? t('panel.moveAction', { subject: subjectLabel }) : t('attention.moveToPlain'))
                : (confirm.current.reversible ? t('panel.unlinkAction') : t('panel.unlinkActionDestructive'));

        const incoming = confirm.kind !== 'unlink' ? candidateNumber(confirm.candidateId) : null;
        const chips: { label: string; strike: boolean }[] = confirm.kind === 'move'
            ? (incoming ? [{ label: incoming, strike: false }] : [])
            : [
                { label: confirm.current.number, strike: true },
                ...(incoming ? [{ label: incoming, strike: false }] : []),
            ];

        return (
            <div className={cn(PANEL_SHELL, PANEL_TABLE_INDENT)}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    {chips.map(chip => <Chip key={chip.label} strike={chip.strike}>{chip.label}</Chip>)}
                    <span>{sentence}</span>
                    <Button
                        size="sm"
                        variant={confirm.kind === 'unlink' ? 'outline' : 'default'}
                        className={confirm.kind === 'unlink' ? 'text-destructive hover:text-destructive' : undefined}
                        disabled={saving}
                        onClick={() => onConfirm(confirm)}
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : actionLabel}
                    </Button>
                    <Button size="sm" variant="outline" disabled={saving} onClick={onCancelConfirm}>
                        {t('panel.cancel')}
                    </Button>
                </div>
            </div>
        );
    }

    const noResults = rows.length === 0 && query.trim().length > 0;

    return (
        <div className={cn(PANEL_SHELL, PANEL_TABLE_INDENT)}>
            {/* The ΑΔΑ step and the manual form carry their own titles. */}
            {step === 'list' && (
                <h3 className="text-[15px] font-semibold">
                    {current ? t('panel.changeTitle', { subject: subjectLabel }) : t('panel.linkTitle', { subject: subjectLabel })}
                </h3>
            )}
            {step === 'list' && current && (
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('panel.currentIs')} <span className="font-semibold text-foreground">{current.number}</span>
                    {current.title && <> — {current.title}</>}{' '}
                    <QuietButton
                        onClick={() => onOpenDocument(current.id)}
                        disabled={saving}
                        aria-label={t('attention.openDocumentFor', { number: current.number })}
                    >
                        {t('panel.open')}
                    </QuietButton>
                </p>
            )}
            {/* Rendered above the steps, not inside any one of them: a write
                or a lookup can fail from more than one step, and an error
                trapped in the step that produced it disappears the moment
                another step is the one left open. */}
            {error && (
                <div className={cn(ANSWER_ROW, 'mt-3 first:mt-0 items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm')}>
                    <span>{t('panel.saveFailed')} {error}</span>
                    <Button variant="outline" size="sm" onClick={onRetry}>{t('panel.retry')}</Button>
                </div>
            )}
            {step === 'ada' && renderAdaStep ? (
                <div className="mt-3 first:mt-0">
                    {renderAdaStep({
                        noCandidates: offerableCount === 0,
                        onBack: offerableCount > 0 ? () => setStep('list') : null,
                        onManual: () => setStep('manual'),
                        onClose,
                    })}
                </div>
            ) : step === 'manual' ? (
                <div className="mt-3 first:mt-0">
                    {renderManualStep({ onBack: offerableCount > 0 ? () => setStep('list') : renderAdaStep ? () => setStep('ada') : null, toAda: () => setStep('ada'), onClose })}
                </div>
            ) : (
                <div className="mt-3 space-y-3">
                    <p className="max-w-xl text-[13px] text-muted-foreground">
                        {current ? t('panel.changeHint', { number: current.number }) : t('panel.linkHint')}
                    </p>
                    <Input
                        inputMode="numeric"
                        value={query}
                        onChange={e => onQueryChange(e.target.value)}
                        placeholder={t('panel.searchPlaceholder')}
                        className="max-w-xs"
                    />
                    <div className="space-y-1.5">
                        {(showAll ? rows : rows.slice(0, LIST_LIMIT)).map(row => {
                            const date = row.candidate.publishDate ? formatCalendarDate(row.candidate.publishDate, locale) : null;
                            const elsewhereLabel = row.elsewhere?.label ?? '';
                            // Every row's controls read alike — "Άνοιγμα", "Σύνδεση" —
                            // so a screen reader listing them names the same two
                            // buttons eight times. The decision's number is what
                            // tells the rows apart, the way the questions card
                            // already names its own.
                            const number = row.candidate.decisionNumber ?? row.candidate.ada;
                            let meta: ReactNode;
                            let label: string;
                            let ariaLabel: string;
                            let variant: 'default' | 'outline';
                            let onClick: () => void;
                            if (row.kind === 'free') {
                                meta = row.likely || date
                                    ? (
                                        <>
                                            {row.likely && <span className="text-green-700 font-semibold">{t('attention.likelyMatch')}</span>}
                                            {row.likely && date && ' · '}
                                            {date}
                                        </>
                                    )
                                    : null;
                                label = t('panel.link');
                                ariaLabel = t('panel.linkNumberTo', { number, subject: subjectLabel });
                                variant = row.likely ? 'default' : 'outline';
                                onClick = () => handleLink(row.candidate.id);
                            } else if (row.kind === 'proposedElsewhere') {
                                meta = t('panel.proposedFor', { subject: elsewhereLabel });
                                label = t('panel.link');
                                ariaLabel = t('panel.linkNumberTo', { number, subject: subjectLabel });
                                variant = 'outline';
                                onClick = () => handleLink(row.candidate.id);
                            } else {
                                meta = t('panel.linkedTo', { subject: elsewhereLabel });
                                label = t('panel.moveHere');
                                ariaLabel = t('panel.moveNumberTo', { number, subject: subjectLabel });
                                variant = 'outline';
                                onClick = () => onAskConfirm({ kind: 'move', candidateId: row.candidate.id, from: elsewhereLabel });
                            }
                            const isPending = saving && pendingId === row.candidate.id;
                            return (
                                <RecordRow
                                    key={row.candidate.id}
                                    lead={<Chip>{number}</Chip>}
                                    title={row.candidate.title}
                                    meta={meta}
                                    open={(
                                        <QuietButton
                                            onClick={() => onOpenDocument(row.candidate.id)}
                                            disabled={saving}
                                            aria-label={t('attention.openDocumentFor', { number })}
                                        >
                                            {t('panel.open')}
                                        </QuietButton>
                                    )}
                                    action={(
                                        <Button size="sm" variant={variant} aria-label={ariaLabel} disabled={saving} onClick={onClick}>
                                            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" />{t('panel.saving')}</> : label}
                                        </Button>
                                    )}
                                />
                            );
                        })}
                    </div>
                    {!showAll && rows.length > LIST_LIMIT && (
                        <QuietButton onClick={() => setShowAll(true)}>{t('panel.showAll', { count: rows.length })}</QuietButton>
                    )}
                    {noResults && (
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <p>{t('panel.noResults', { query })}</p>
                            {renderAdaStep && <Button variant="outline" size="sm" onClick={() => setStep('ada')}>{t('panel.addWithAda')}</Button>}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                        <span>{t('panel.notHere')}</span>
                        {/* The empty-result state above already offers this same action —
                            repeating it here would show two identically-labelled buttons. */}
                        {!noResults && renderAdaStep && (
                            <>
                                <span aria-hidden>&middot;</span>
                                <QuietButton onClick={() => setStep('ada')} disabled={saving}>{t('panel.addWithAda')}</QuietButton>
                            </>
                        )}
                        <span aria-hidden>&middot;</span>
                        <QuietButton onClick={() => setStep('manual')} disabled={saving}>{t('panel.addManually')}</QuietButton>
                        {current && (
                            <>
                                <span aria-hidden>&middot;</span>
                                <QuietButton
                                    className="text-destructive hover:text-destructive"
                                    disabled={saving}
                                    onClick={() => onAskConfirm({ kind: 'unlink', current: { number: current.number, reversible: current.reversible } })}
                                >
                                    {t('panel.unlinkOpen', { number: current.number })}
                                </QuietButton>
                            </>
                        )}
                        <span aria-hidden>&middot;</span>
                        <QuietButton onClick={onClose} disabled={saving}>{t('panel.close')}</QuietButton>
                    </div>
                </div>
            )}
        </div>
    );
}
