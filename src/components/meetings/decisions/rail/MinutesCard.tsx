"use client";

import { useTranslations } from 'next-intl';
import { FileText, Download, Loader2, RefreshCw } from 'lucide-react';
import { CtaButton } from '@/components/ui/cta-button';
import { RailCard } from '@/components/ui/rail-card';
import { cn } from '@/lib/utils';

/** The rail's minutes card: what the document will say, then the ways to get
 * it — a preview, the DOCX a municipality files as its own record, and a
 * re-run of the derivation over the facts already stored.
 * No fetching — the page owns the minutes data, the counts and every request.
 *
 * The readiness line is a statement, never a warning: a subject with no
 * decision is normal, and the clerk is being told what the printed minutes
 * will carry, not that the meeting is wrong. It therefore counts the minutes
 * snapshot, which is what the preview and the DOCX render — never the
 * decisions payload, which answers a different request. */
export function MinutesCard({ onPreview, onExport, previewDisabled, readiness, onRederive, isRederiving }: {
    onPreview: () => void;
    onExport: () => void;
    previewDisabled: boolean;
    /** Counted off the minutes snapshot by `minutesReadiness`. Null while the
     * minutes have not loaded, or failed to: the card then offers the buttons
     * and says nothing about the document, rather than describing it from the
     * decisions payload, which is a different request and can be older. */
    readiness: { subjects: number; undecided: number } | null;
    onRederive: () => void;
    isRederiving: boolean;
}) {
    const tPage = useTranslations('admin.decisionsPage');
    const t = useTranslations('admin.adminActions');

    const hasSubjects = readiness !== null && readiness.subjects > 0;
    const undecided = (readiness?.undecided ?? 0) > 0;

    return (
        <RailCard title={tPage('rail.minutesTitle')}>
            {readiness === null ? null : hasSubjects ? (
                <div className="flex items-start gap-2">
                    <span
                        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', undecided ? 'bg-amber-500' : 'bg-green-600')}
                        aria-hidden
                    />
                    <div className="min-w-0">
                        <p className={cn('text-xs font-medium', undecided ? 'text-amber-700' : 'text-green-700')}>
                            {undecided
                                ? tPage('rail.minutesUndecided', { n: readiness.undecided })
                                : tPage('rail.minutesAllDecided')}
                        </p>
                        {undecided && (
                            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                {tPage('rail.minutesUndecidedHint', { n: readiness.undecided })}
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-xs leading-snug text-muted-foreground">{t('minutes.noSubjects')}</p>
            )}

            {/* The city pages' call to action: the export solid, the two quieter
                actions as CtaButton's own text variant beside it. */}
            <div className="mt-3 flex flex-col gap-2">
                <CtaButton variant="text" arrow={false} disabled={previewDisabled || !hasSubjects} onClick={onPreview}>
                    <FileText className="h-4 w-4" />
                    {tPage('previewMinutes')}
                </CtaButton>
                <CtaButton arrow={false} className="w-full" onClick={onExport}>
                    <Download className="h-4 w-4" />
                    {tPage('exportDocx')}
                </CtaButton>
                <CtaButton variant="text" arrow={false} disabled={isRederiving} onClick={onRederive}>
                    {isRederiving
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <RefreshCw className="h-4 w-4" />}
                    {tPage('rederive')}
                </CtaButton>
            </div>

            <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">{tPage('rail.minutesProvenance')}</p>
        </RailCard>
    );
}
