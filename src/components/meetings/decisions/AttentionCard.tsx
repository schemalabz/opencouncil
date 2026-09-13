"use client"

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuietButton, RadioList, type RadioOption } from './controls';
import type { Attention, AttentionSubject, CandidateView, Conflict, Proposal, Unplaced, WorkEstimate } from './attention';

/** A question answered in this visit, kept on screen as a receipt. */
export interface Receipt {
    id: string;
    text: string;
    /** Set while unlinking the row's decision would restore the previous state: the row still holds this document. */
    undo?: { subjectId: string; ada: string };
}

interface AttentionCardProps {
    attention: Attention;
    estimate: WorkEstimate;
    receipts: Receipt[];
    busyCandidateId: string | null;
    undoingSubjectId: string | null;
    unplacedOpen: boolean;
    /** Polling cannot run for this city: the empty state drops its promise of a next check. */
    pollingBlocked: boolean;
    onToggleUnplaced: () => void;
    onAccept: (proposal: Proposal) => void;
    onReject: (proposal: Proposal) => void;
    onOpenDocument: (candidate: CandidateView, subject: AttentionSubject) => void;
    onOpenConflictDocument: (conflict: Conflict) => void;
    onKeepHolder: (conflict: Conflict) => void;
    onMoveToClaimant: (conflict: Conflict) => void;
    onChooseSubject: (item: Unplaced) => void;
    onDismiss: (candidate: CandidateView) => void;
    onUndo: (receipt: Receipt) => void;
    /** "Θέμα 9", or the register label for a subject without a number; null when it has neither. */
    subjectLabel: (subject: AttentionSubject) => string | null;
    /** The inline form: "θέμα 9", or «name». */
    subjectRef: (subject: AttentionSubject) => string;
}

/** "Θέμα 9 · Name", or just the name when the subject carries no number. */
const subjectText = (label: string | null, name: string) => (label ? `${label} · ${name}` : name);

const Spinner = () => <Loader2 className="h-4 w-4 animate-spin" />;

/**
 * Everything a person still has to look at, phrased as questions with their
 * answers, in one list: quickest first, the documents no subject claims last
 * and folded. Details stay in the sheet; a row carries the two titles a
 * decision needs.
 */
export function AttentionCard({ attention, estimate, receipts, busyCandidateId, undoingSubjectId, unplacedOpen, pollingBlocked, onToggleUnplaced, onAccept, onReject, onOpenDocument, onOpenConflictDocument, onKeepHolder, onMoveToClaimant, onChooseSubject, onDismiss, onUndo, subjectLabel, subjectRef }: AttentionCardProps) {
    const t = useTranslations('admin.decisionsPage.attention');
    // Which side of each conflict the person has picked; the holder by default.
    const [claimantPicked, setClaimantPicked] = useState<Record<string, boolean>>({});
    // A document read without a number is labelled plainly; its ΑΔΑ then stands in for the title.
    const decisionLabel = (candidate: CandidateView) =>
        candidate.decisionNumber ? t('decisionLabel', { n: candidate.decisionNumber }) : t('decisionPlain');

    const receiptRows = receipts.map(receipt => (
        <div key={receipt.id} className="flex items-center justify-between gap-4 border-t px-5 py-2.5">
            <div className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground">
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-green-600" aria-hidden>
                    <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                </span>
                <span>{receipt.text}</span>
            </div>
            {receipt.undo && (
                <QuietButton
                    className="shrink-0"
                    disabled={undoingSubjectId === receipt.undo.subjectId}
                    onClick={() => onUndo(receipt)}
                >
                    {t('undo')}
                </QuietButton>
            )}
        </div>
    ));

    if (attention.total === 0) {
        return (
            <section className="space-y-3">
                {receipts.length > 0 && (
                    <div className="rounded-2xl border border-foreground/15 bg-card">
                        <div className="-mt-px">{receiptRows}</div>
                    </div>
                )}
                <div className="flex items-start gap-3.5 py-1.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600" aria-hidden>
                        <Check className="h-4 w-4 text-white" strokeWidth={2.6} />
                    </span>
                    <div className="space-y-0.5">
                        <div className="text-base font-semibold">{t('allGood')}</div>
                        {!pollingBlocked && <div className="text-[13.5px] text-muted-foreground">{t('allGoodHint')}</div>}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section id="needs-a-look" className="overflow-hidden rounded-2xl border border-foreground/15 bg-card">
            <div className="flex items-center gap-2.5 px-5 py-3.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                <h2 className="text-[15px] font-semibold">{t('title')}</h2>
                <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold">{attention.total}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                    {estimate.kind === 'underMinute' ? t('estimateUnderMinute') : t('estimateMinutes', { n: estimate.minutes })}
                </span>
            </div>

            {receiptRows}

            {attention.proposals.map(proposal => {
                const busy = busyCandidateId === proposal.candidate.id;
                return (
                    <div key={proposal.candidate.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-t px-5 py-4">
                        <div className="min-w-0 space-y-1.5">
                            <Line label={subjectLabel(proposal.subject) ?? t('subjectPlain')}>
                                <span className="font-medium">{proposal.subject.name}</span>
                            </Line>
                            <Line label={decisionLabel(proposal.candidate)}>
                                <span>{proposal.candidate.title ?? proposal.candidate.ada}</span>
                            </Line>
                            <Line label="">
                                <span className="flex items-center gap-3.5 text-xs">
                                    {proposal.likelyMatch && <span className="font-semibold text-green-700">{t('likelyMatch')}</span>}
                                    <QuietButton onClick={() => onOpenDocument(proposal.candidate, proposal.subject)}>{t('openDocument')}</QuietButton>
                                </span>
                            </Line>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" disabled={busy} onClick={() => onAccept(proposal)}>
                                {busy ? <Spinner /> : t('yes')}
                            </Button>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => onReject(proposal)}>{t('no')}</Button>
                        </div>
                    </div>
                );
            })}

            {attention.conflicts.map(conflict => {
                const busy = busyCandidateId === conflict.candidate.id;
                const moving = conflict.claimant !== null && claimantPicked[conflict.candidate.id] === true;
                const options: RadioOption[] = [{
                    id: 'holder',
                    text: conflict.holder ? subjectText(subjectLabel(conflict.holder), conflict.holder.name) : conflict.holderName,
                    hint: t('holderNow'),
                }];
                if (conflict.claimant) {
                    options.push({ id: 'claimant', text: subjectText(subjectLabel(conflict.claimant), conflict.claimant.name), hint: t('claimant') });
                }
                // The button names the outcome, not the subject: a name would not fit, and the radio already says which.
                const moveLabel = conflict.claimant && conflict.claimant.agendaItemIndex !== null
                    ? t('moveTo', { subject: subjectRef(conflict.claimant) })
                    : t('movePlain');
                return (
                    <div key={conflict.candidate.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-t px-5 py-4">
                        <div className="min-w-0 space-y-1.5">
                            <Line label={decisionLabel(conflict.candidate)}>
                                <span className="flex flex-wrap items-baseline gap-x-3.5">
                                    <span className="font-medium">{conflict.candidate.title ?? conflict.candidate.ada}</span>
                                    <QuietButton onClick={() => onOpenConflictDocument(conflict)}>{t('openDocument')}</QuietButton>
                                </span>
                            </Line>
                            <Line label={t('whichSubject')}>
                                <RadioList
                                    dense
                                    label={t('whichSubject')}
                                    options={options}
                                    value={moving ? 'claimant' : 'holder'}
                                    disabled={busy}
                                    onChange={id => setClaimantPicked(prev => ({ ...prev, [conflict.candidate.id]: id === 'claimant' }))}
                                />
                            </Line>
                        </div>
                        <div className="flex items-center gap-2">
                            {moving ? (
                                <Button size="sm" disabled={busy} onClick={() => onMoveToClaimant(conflict)}>
                                    {busy ? <Spinner /> : moveLabel}
                                </Button>
                            ) : (
                                <Button size="sm" disabled={busy} onClick={() => onKeepHolder(conflict)}>
                                    {busy ? <Spinner /> : t('keepAsIs')}
                                </Button>
                            )}
                        </div>
                    </div>
                );
            })}

            {attention.unplaced.length > 0 && (
                <div className="border-t">
                    <div className="grid min-h-[60px] grid-cols-[minmax(0,1fr)_auto] items-center gap-6 px-5 py-3.5">
                        <div className="min-w-0 space-y-0.5">
                            <div className="text-sm font-medium">{t('unplacedTitle', { n: attention.unplaced.length })}</div>
                            <div className="text-xs text-muted-foreground">{t('unplacedHint')}</div>
                        </div>
                        <QuietButton onClick={onToggleUnplaced}>
                            <span className="inline-flex items-center gap-1.5">
                                {unplacedOpen ? t('hide') : t('show')}
                                {unplacedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </span>
                        </QuietButton>
                    </div>
                    {unplacedOpen && attention.unplaced.map(item => {
                        const busy = busyCandidateId === item.candidate.id;
                        return (
                            <div key={item.candidate.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-t border-border/60 px-5 py-3">
                                <Line label={decisionLabel(item.candidate)}>
                                    <span>{item.candidate.title ?? item.candidate.ada}</span>
                                </Line>
                                <div className="flex flex-col items-end gap-1.5">
                                    <Button size="sm" disabled={busy} onClick={() => onChooseSubject(item)}>
                                        {busy ? <Spinner /> : t('chooseSubject')}
                                    </Button>
                                    <QuietButton disabled={busy} onClick={() => onDismiss(item.candidate)}>{t('notThisMeeting')}</QuietButton>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

/** A labelled line: the label column keeps subject and decision aligned. */
function Line({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 items-baseline gap-3">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
            <span className="min-w-0 text-sm leading-snug">{children}</span>
        </div>
    );
}
