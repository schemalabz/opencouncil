"use client";

import { Fragment, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import {
    ResponsiveSheet,
    ResponsiveSheetBody,
    ResponsiveSheetContent,
    ResponsiveSheetHeader,
    ResponsiveSheetTitle,
} from '@/components/ui/responsive-sheet';
import { AIGeneratedBadge } from '@/components/AIGeneratedBadge';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { useTranscriptOptions } from '@/components/meetings/options/OptionsContext';
import { useToast } from '@/hooks/use-toast';
import { captureEvent } from '@/lib/analytics/capture';
import { buildDecisionTable, RESULT_MESSAGE_KEY, type DecisionTableRow } from '@/lib/decisionsTable/rows';
import { downloadFromUrl } from '@/lib/export/download';
import { cn } from '@/lib/utils';
import type { ResultKey } from '@/lib/utils/decisionResult';
import { getWithdrawnLabel, sectionHeadingAt } from '@/lib/utils/subjects';
import { voteCountsPhrase } from '@/lib/utils/votes';
import { inlinePdfUrl } from '@/components/meetings/decisions/pdfUrl';

/**
 * The grid from `md` up: Α/Α, the subject with its summary under it, the
 * decision number, the result with its counts on the same line. Below `md` a
 * row stacks: the subject and its summary first, then the number and the
 * result on one line, with the counts under the result word.
 *
 * The cells align on their first baseline: the title is a size larger than
 * the number and the result, and aligning the tops put its text a few pixels
 * below theirs.
 */
const ROW_GRID = 'md:grid md:grid-cols-[36px_minmax(0,1fr)_110px_230px] md:items-baseline md:gap-3';

/**
 * The Α/Α column exists from `md` up. Its label and its cells leave the a11y
 * tree together: a `role="table"` maps cells to labels by position, so a
 * hidden cell under a label that stayed shifts every label on the row.
 */
const INDEX_COLUMN = 'hidden md:block';

const RESULT_MUTED: ReadonlyArray<ResultKey> = ['withdrawn', 'none', 'noVote'];

/**
 * The counts beside the result word, always on screen: «Ομόφωνα · 9 υπέρ».
 * In the grid they share the word's line, so a row with a vote is no taller
 * than a row without one. In the stacked rows below `md` they sit under the
 * word, where the line has no room for them.
 */
const VOTE_COUNTS = 'block text-[11px] leading-none text-muted-foreground md:inline md:text-[12px] md:leading-[inherit]';

type Translate = ReturnType<typeof useTranslations>;

/**
 * The reader's Πίνακας αποφάσεων: the same rows as the admin decisions page,
 * read off the subjects the meeting page already holds, with no admin data.
 * A side panel on desktop and a drawer on a phone. The download is for admins:
 * the route checks again on the server.
 */
export function DecisionsTablePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { meeting, subjects, city } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const t = useTranslations('decisionsTable');
    const tSubject = useTranslations('Subject');
    const { toast } = useToast();
    const [exporting, setExporting] = useState(false);

    const table = useMemo(() => buildDecisionTable(subjects), [subjects]);
    const rowSubjects = table.rows.map(row => row.subject);
    const hasBothSections = table.rows.some(r => r.section === 'outOfAgenda') && table.rows.some(r => r.section === 'agenda');
    const hasSummary = table.rows.some(row => row.summary !== null);

    const handleExport = async () => {
        setExporting(true);
        try {
            await downloadFromUrl(
                `/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions/table`,
                `decisions-table-${city.id}-${meeting.id}.docx`,
            );
            captureEvent('meeting_page_action', { action: 'decisions_table_export', city_id: meeting.cityId, meeting_id: meeting.id });
            toast({ title: t('exportSuccess') });
        } catch {
            toast({ title: t('exportError'), variant: 'destructive' });
        } finally {
            setExporting(false);
        }
    };

    return (
        <ResponsiveSheet open={open} onOpenChange={onOpenChange}>
            <ResponsiveSheetContent className="sm:max-w-4xl" describedBy={null}>
                {/* The title says what the panel is; the meeting is the page behind it.
                    The download sits beside the title, where an admin looks first, and
                    leaves room on the right for the sheet's close control. */}
                <ResponsiveSheetHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 md:pr-10">
                    <ResponsiveSheetTitle>{t('title')}</ResponsiveSheetTitle>
                    {options.editsAllowed && (
                        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
                            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            {t('export')}
                        </Button>
                    )}
                </ResponsiveSheetHeader>
                <ResponsiveSheetBody>
                    {table.rows.length === 0 ? (
                        <p className="py-6 text-sm text-muted-foreground">{t('empty')}</p>
                    ) : (
                        <div role="table" aria-label={t('title')}>
                            <div role="row" className={cn(ROW_GRID, 'sr-only border-b border-foreground/10 text-[11px] font-medium text-muted-foreground md:not-sr-only md:py-2')}>
                                <div role="columnheader" className={INDEX_COLUMN}>{t('colIndex')}</div>
                                <div role="columnheader">{t('colSubject')}</div>
                                <div role="columnheader">{t('colNumber')}</div>
                                <div role="columnheader">{t('colResult')}</div>
                            </div>
                            {table.rows.map((row, i) => {
                                const heading = hasBothSections ? sectionHeadingAt(rowSubjects, i) : null;
                                return (
                                    <Fragment key={row.subject.id}>
                                        {heading && (
                                            <div role="presentation" className="-mt-px border-t border-border/60 pb-1 pt-3 text-[12px] font-semibold text-muted-foreground">
                                                {t(heading === 'agenda' ? 'sectionAgenda' : 'sectionOutOfAgenda')}
                                            </div>
                                        )}
                                        <Row row={row} t={t} tSubject={tSubject} cityId={city.id} meetingId={meeting.id} />
                                    </Fragment>
                                );
                            })}
                            {table.beforeAgenda.length > 0 && (
                                <div role="row" className="py-3 text-[13px] text-muted-foreground">
                                    <div role="cell">{t('beforeAgenda', { n: table.beforeAgenda.length })}</div>
                                </div>
                            )}
                        </div>
                    )}
                    {hasSummary && <AIGeneratedBadge className="mt-3 justify-end" />}
                </ResponsiveSheetBody>
            </ResponsiveSheetContent>
        </ResponsiveSheet>
    );
}

function Row({ row, t, tSubject, cityId, meetingId }: { row: DecisionTableRow; t: Translate; tSubject: Translate; cityId: string; meetingId: string }) {
    const muted = RESULT_MUTED.includes(row.result);
    const index = row.subject.agendaItemIndex;
    return (
        <div role="row" className={cn(ROW_GRID, 'flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-foreground/5 py-3')}>
            <div role="cell" className={cn(INDEX_COLUMN, 'text-[13px] tabular-nums text-muted-foreground')}>{index ?? ''}</div>
            <div role="cell" className="w-full min-w-0 text-[14px] md:w-auto">
                <Link
                    href={`/${cityId}/${meetingId}/subjects/${row.subject.id}`}
                    className={cn('hover:text-primary hover:underline', row.subject.withdrawn && 'text-muted-foreground')}
                >
                    {index !== null && <span className="mr-1 text-muted-foreground md:hidden">{index}.</span>}
                    {row.subject.name}
                </Link>
                {row.summary && (
                    <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
                        {row.summary.text}
                        {row.summary.source === 'discussion' && (
                            <span className="ml-1.5 whitespace-nowrap text-[11px] uppercase tracking-wide text-muted-foreground/70">· {t('fromDiscussion')}</span>
                        )}
                    </p>
                )}
            </div>
            <div role="cell" className="text-[13px]">
                {row.subject.withdrawn ? (
                    <span className="text-muted-foreground">{getWithdrawnLabel(tSubject, row.subject)}</span>
                ) : row.decision ? (
                    <a
                        href={inlinePdfUrl(row.decision.pdfUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('openDocument')}
                        className="inline-flex items-center gap-1 font-medium tabular-nums hover:text-primary hover:underline"
                    >
                        {row.decision.number ?? t('linked')}
                        <ExternalLink className="h-3 w-3" />
                    </a>
                ) : (
                    <span className="rounded-full border border-dashed border-amber-400 px-2 py-px text-[11px] font-medium text-amber-700">{t('pending')}</span>
                )}
            </div>
            <div role="cell" className="ml-auto text-right text-[13px] md:ml-0 md:text-left">
                {row.result === 'withdrawn' ? (
                    <span className="text-muted-foreground">—</span>
                ) : (
                    <span
                        className={cn(muted ? 'text-muted-foreground' : 'font-medium text-foreground', row.result === 'noVote' && 'cursor-help border-b border-dotted border-muted-foreground/50')}
                        title={row.result === 'noVote' ? t('noVoteHint') : undefined}
                    >
                        {t(RESULT_MESSAGE_KEY[row.result])}
                    </span>
                )}
                {row.voteCounts && (
                    <span className={VOTE_COUNTS}>
                        <span className="hidden md:inline"> · </span>
                        {voteCountsPhrase(t, row.voteCounts)}
                    </span>
                )}
            </div>
        </div>
    );
}
