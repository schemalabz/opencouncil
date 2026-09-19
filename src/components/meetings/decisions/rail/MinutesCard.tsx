"use client";

import { useTranslations } from 'next-intl';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RailCard } from '@/components/ui/rail-card';
import { cn } from '@/lib/utils';

/** The rail's minutes card: what the document will say, then the two ways to
 * get it — a preview, and the DOCX a municipality files as its own record.
 * No fetching — the page owns the minutes data, the counts and the export.
 *
 * The readiness line is a statement, never a warning: a subject with no
 * decision is normal, and the clerk is being told what the printed minutes
 * will carry, not that the meeting is wrong. It therefore counts the minutes
 * snapshot, which is what the preview and the DOCX render — never the
 * decisions payload, which answers a different request. */
export function MinutesCard({ onPreview, onExport, previewDisabled, readiness }: {
    onPreview: () => void;
    onExport: () => void;
    previewDisabled: boolean;
    /** Counted off the minutes snapshot by `minutesReadiness`. Null while the
     * minutes have not loaded, or failed to: the card then offers the buttons
     * and says nothing about the document, rather than describing it from the
     * decisions payload, which is a different request and can be older. */
    readiness: { subjects: number; undecided: number } | null;
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

            <div className="mt-3 flex flex-col gap-2">
                <Button variant="outline" size="sm" className="justify-start" disabled={previewDisabled || !hasSubjects} onClick={onPreview}>
                    <FileText className="h-3.5 w-3.5 mr-1.5" />
                    {tPage('previewMinutes')}
                </Button>
                <Button size="sm" className="justify-start" onClick={onExport}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    {tPage('exportDocx')}
                </Button>
            </div>

            <p className="mt-2.5 text-[11px] leading-snug text-muted-foreground">{tPage('rail.minutesProvenance')}</p>
        </RailCard>
    );
}
