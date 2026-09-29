"use client";

import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { formatCalendarDate } from '@/lib/formatters/time';

/**
 * What the document says about itself, next to the subject it may belong to:
 * the facts a clerk checks before a link, and a warning for each fact that
 * disagrees with this meeting.
 */
export function CandidateFacts({ publishDate, declaredDate, meetingDate, readStatus, organizationLabel, proposal }: {
    publishDate: string | null;
    /** The session the document states, `YYYY-MM-DD`. */
    declaredDate: string | null;
    /** This meeting's city-local date, `YYYY-MM-DD`. */
    meetingDate: string;
    readStatus: string;
    /** Set only when a lookup found the document under another organization. */
    organizationLabel: string | null;
    proposal: { confidence: number | null; reasoning: string | null } | null;
}) {
    const t = useTranslations('admin.decisionsPage.sheet');
    const locale = useLocale();
    const date = (d: string) => formatCalendarDate(d, locale);
    const warnings = [
        declaredDate && declaredDate !== meetingDate ? t('warnOtherSession', { date: date(declaredDate) }) : null,
        readStatus !== 'ok' ? t('warnUnread') : null,
        organizationLabel ? t('warnOtherOrganization', { label: organizationLabel }) : null,
    ].filter((w): w is string => w !== null);

    return (
        <div className="space-y-2 text-xs">
            <div className="text-muted-foreground">
                {publishDate && <p>{t('factsPublished', { date: date(publishDate) })}</p>}
                {declaredDate && declaredDate === meetingDate && <p>{t('factsDeclared', { date: date(declaredDate) })}</p>}
            </div>
            {warnings.map(w => (
                <p key={w} className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}
                </p>
            ))}
            {proposal?.reasoning && (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {t('proposalReasoning', { confidence: Math.round((proposal.confidence ?? 0) * 100) })}
                    </span>{' '}{proposal.reasoning}
                </p>
            )}
        </div>
    );
}
