"use client";

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { Issue } from '@/lib/derivation/types';

/** Where an issue's statement can be checked, as the page can link it. */
export interface EvidenceLinks {
    /** The recording at an utterance; undefined for one the page cannot place. */
    recordingHref?: (utteranceId: string) => string | undefined;
    /** The uploaded attendance sheet, when there is one. */
    sheetHref?: string;
}

/**
 * Where the statement behind an issue can be checked: the recording at the
 * utterance the transcript cites, or the line of the sheet (issue #807). Shared
 * by the rail's meeting issues and the table's issue row, so both link alike.
 * Renders nothing for an issue that cites neither.
 *
 * @translationNamespace admin.decisionsPage
 */
export function IssueEvidence({ issue, links }: { issue: Issue; links?: EvidenceLinks }) {
    const t = useTranslations('admin.decisionsPage');
    const utteranceId = issue.evidence?.utteranceId;
    const line = issue.evidence?.line;
    if (!utteranceId && line === undefined) return null;
    const href = utteranceId ? links?.recordingHref?.(utteranceId) : undefined;
    const linkClass = 'underline decoration-dotted underline-offset-2 hover:text-foreground';
    return (
        <span className="block text-[11px] text-muted-foreground/80">
            {utteranceId && (href
                ? <Link href={href} className={linkClass}>{t('issues.evidence.openRecording')}</Link>
                : <span>{t('issues.evidence.utterance', { id: utteranceId })}</span>)}
            {utteranceId && line !== undefined && ' · '}
            {line !== undefined && (links?.sheetHref
                ? <a href={links.sheetHref} target="_blank" rel="noreferrer" className={linkClass}>{t('issues.evidence.sheetLine', { line })}</a>
                : t('issues.evidence.sheetLine', { line }))}
        </span>
    );
}
