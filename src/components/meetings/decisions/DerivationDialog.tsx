"use client";

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SeverityDot } from '@/components/meetings/decisions/auditGlossary';
import {
    DERIVATION_STAGES, ISSUE_SEVERITY, ISSUE_STAGES, codesForStage,
    type DerivationStage,
} from '@/lib/derivation/issueCatalogue';

/**
 * How a fact gets from the Diavgeia PDF to the πρακτικά, in the six steps
 * `DERIVATION_STAGES` names: what each step keeps from the source, what it
 * computes from that, and what it can leave unanswered.
 *
 * The whole structure is read off `issueCatalogue.ts` — which codes a step
 * lists, each code's severity dot, and the «και στο βήμα X» marker on a code
 * two steps raise. A hand-written list here would be a second copy of the
 * catalogue that nothing keeps honest, and the first code added to the
 * derivation would go silently missing from its own explanation.
 *
 * Superadmin content: the page renders it only for one, so nothing here
 * re-derives that.
 *
 * It takes no meeting. Per-step counts of this meeting's issues were tried and
 * removed: issues are never stored — `explainMeeting()` recomputes them on every
 * read, so the numbers existed only while the page was open — the rail's issues
 * card already counts them per code, and a two-step code counts under both
 * steps, so the column could not be summed. This page explains the machine; the
 * meeting's own state is read on the page behind it.
 *
 * @translationNamespace admin.decisionsPage
 */
export function DerivationDialog({ open, onOpenChange }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const t = useTranslations('admin.decisionsPage');
    const bold = (chunks: React.ReactNode) => <strong className="font-semibold">{chunks}</strong>;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent align="start" className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-start justify-between gap-4">
                        <DialogTitle>{t('derivation.title')}</DialogTitle>
                        <span className="mt-1 shrink-0 text-[10px] font-extrabold uppercase tracking-[.14em] text-[hsl(var(--orange))]/70">
                            {t('derivation.superadminOnly')}
                        </span>
                    </div>
                    <DialogDescription>{t('derivation.subtitle')}</DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
                    {/* The one rule the five steps are an application of: it is
                        what makes the per-step split mean anything, so it sits
                        above them rather than inside step 0. */}
                    <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-foreground/80">
                        <p>{t.rich('derivation.rule', { b: bold })}</p>
                        <p className="mt-1.5">{t('derivation.ruleWhy')}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                        {DERIVATION_STAGES.map((stage, index) => (
                            <section key={stage} className="rounded-xl border bg-background px-3.5 py-3">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                                        {index}
                                    </span>
                                    <div className="min-w-0 grow">
                                        <h3 className="text-[13px] font-semibold">{t(`derivation.stages.${stage}.name`)}</h3>
                                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                            {t(`derivation.stages.${stage}.what`)}
                                        </p>
                                    </div>
                                </div>

                                {/* The write step states and derives nothing — it
                                    only persists — so it carries no strip. */}
                                {t.has(`derivation.stages.${stage}.stated`) && (
                                    <div className="mt-2.5 flex flex-col gap-2 sm:ml-9 sm:flex-row">
                                        <StripBox
                                            label={t('derivation.stated')}
                                            dot={<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />}
                                            text={t(`derivation.stages.${stage}.stated`)}
                                        />
                                        <StripBox
                                            label={t('derivation.derived')}
                                            dot={<span className="h-1.5 w-1.5 rounded-full border border-dashed border-muted-foreground/60" aria-hidden />}
                                            text={t(`derivation.stages.${stage}.derived`)}
                                        />
                                    </div>
                                )}

                                <div className="mt-2.5 flex flex-col gap-1.5 sm:ml-9">
                                    <div className="text-[10px] font-extrabold uppercase tracking-[.04em] text-muted-foreground">
                                        {t(`derivation.stages.${stage}.codesLabel`)}
                                    </div>
                                    {codesForStage(stage).map(code => (
                                        <div key={code} className="flex items-start gap-2">
                                            <SeverityDot severity={ISSUE_SEVERITY[code]} className="mt-[5px]" />
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                    <span className="text-xs">{t(`issues.codes.${code}`)}</span>
                                                    {ISSUE_STAGES[code].filter(other => other !== stage).map(other => (
                                                        <span key={other} className="rounded border px-1 text-[10px] text-muted-foreground">
                                                            {t('derivation.alsoAtStep', { n: DERIVATION_STAGES.indexOf(other) })}
                                                        </span>
                                                    ))}
                                                </div>
                                                <p className="mt-px text-[11px] leading-relaxed text-muted-foreground">
                                                    {t(`derivation.why.${stage}.${code}`)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>

                <div className="shrink-0 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {t.rich('derivation.footer', { b: bold })}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** One half of a step's «Δηλώνεται / Συνάγεται» strip. */
function StripBox({ label, dot, text }: { label: string; dot: React.ReactNode; text: string }) {
    return (
        <div className="flex-1 rounded-lg border bg-muted/30 px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1.5">
                {dot}
                <span className="text-[10px] font-extrabold uppercase tracking-[.04em] text-muted-foreground">{label}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{text}</p>
        </div>
    );
}
