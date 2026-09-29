"use client";

import { FileText, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { AdminToolButton } from '@/components/admin/AdminStrip';
import { formatDateTime } from '@/lib/formatters/time';
import type { MeetingFactsReading } from '@/lib/apiTypes';
import type { FactSourceAction, FactSourceKind, MeetingFactSource } from '@/components/meetings/decisions/useMeetingFactSources';

/** What the page hands the card: the rows, what is on its way, and the actions. */
export interface SourcesPanel {
    /** Null until the first load returns. */
    sources: MeetingFactSource[] | null;
    loadFailed: boolean;
    busy: FactSourceAction | null;
    isReading: (source: FactSourceKind) => boolean;
    /** The failure of the source's latest read, when it failed. */
    failure: (source: FactSourceKind) => string | null;
    timezone: string;
    /** Where the uploaded sheet file is served, for a reviewer to look at it. */
    fileHref?: string;
    onUpload: (file: File) => void;
    onReread: () => void;
    onRemove: () => void;
    onReadTranscript: () => void;
}

const ACCEPTED = 'image/*,application/pdf';

const titleClass = 'text-[11px] font-extrabold tracking-[.04em] text-muted-foreground';

/** The reader's own doubts: its warnings, and the names it matched to nobody. */
function ReaderNotes({ reading }: { reading: MeetingFactsReading | null }) {
    const tPage = useTranslations('admin.decisionsPage');
    if (!reading) return null;
    const warnings = reading.warnings ?? [];
    const unmatched = reading.unmatchedNames ?? [];
    if (warnings.length === 0 && unmatched.length === 0) return null;
    return (
        <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
            {warnings.length > 0 && (
                <div>
                    <span className="font-medium">{tPage('sources.warnings')}</span>
                    <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                        {warnings.map((warning, i) => <li key={`${warning.code}-${i}`}>{warning.message}</li>)}
                    </ul>
                </div>
            )}
            {unmatched.length > 0 && <div>{tPage('sources.unmatchedNames', { names: unmatched.join(', ') })}</div>}
        </div>
    );
}

/**
 * The rail's sources card: the meeting's attendance sheet and its transcript
 * as sources of the roll call, the arrivals and departures, and the votes
 * (issue #807). The page owns the rows and every action; this shows each
 * source's state and offers the next step.
 *
 * A reading counts as soon as it lands. Correcting a reading by hand, and
 * confirming it, comes with the manual editing of attendance and results.
 */
export function SourcesCard({ sources, loadFailed, busy, isReading, failure, timezone, fileHref, onUpload, onReread, onRemove, onReadTranscript }: SourcesPanel) {
    const tPage = useTranslations('admin.decisionsPage');
    const locale = useLocale();
    const sheet = sources?.find(s => s.source === 'sheet') ?? null;
    const transcript = sources?.find(s => s.source === 'transcript') ?? null;
    const when = (iso: string) => formatDateTime(new Date(iso), timezone, 'medium', locale);

    const remove = () => {
        if (!confirm(tPage('sources.sheet.removeConfirm'))) return;
        onRemove();
    };

    const spinner = <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />;

    const failed = (source: FactSourceKind) => {
        const error = failure(source);
        if (error === null || isReading(source)) return null;
        return <p className="text-xs text-destructive">{tPage('sources.readFailed', { error })}</p>;
    };

    const sheetStatus = () => {
        if (!sheet) return null;
        if (isReading('sheet')) {
            return (
                <p className="inline-flex items-center text-xs text-muted-foreground">
                    {spinner}
                    {tPage('sources.sheet.reading', { file: sheet.fileName ?? '' })}
                </p>
            );
        }
        if (sheet.status !== 'uploaded') return <p className="text-xs">{tPage('sources.sheet.read', { date: when(sheet.updatedAt) })}</p>;
        return <p className="text-xs text-muted-foreground">{tPage('sources.sheet.uploaded')}</p>;
    };

    const readingCounts = (reading: MeetingFactsReading) => tPage('sources.transcript.counts', {
        entries: reading.rollCall?.entries.length ?? 0,
        changes: reading.attendanceChanges.length,
        votes: reading.votes.length,
    });

    return (
        <div className="rounded-lg border bg-background p-2.5">
            <span className={`block ${titleClass}`}>{tPage('sources.title')}</span>
            {loadFailed && <p className="mt-1 text-xs text-destructive">{tPage('sources.loadFailed')}</p>}
            {sources && (
                <div className="mt-2 space-y-3">
                    <section>
                        <div className="text-[11px] text-muted-foreground">{tPage('sources.sheet.label')}</div>
                        {!sheet ? (
                            <div className="mt-1 space-y-1.5">
                                <p className="text-xs text-muted-foreground">{tPage('sources.sheet.none')}</p>
                                <input
                                    type="file"
                                    accept={ACCEPTED}
                                    aria-label={tPage('sources.sheet.upload')}
                                    className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-xs"
                                    disabled={busy !== null}
                                    onChange={event => {
                                        const file = event.target.files?.[0];
                                        if (file) onUpload(file);
                                        event.target.value = '';
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="mt-1 space-y-1.5">
                                {sheet.fileName && (
                                    <p className="truncate text-[11px] text-muted-foreground">
                                        {fileHref ? (
                                            <a href={fileHref} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground">{sheet.fileName}</a>
                                        ) : sheet.fileName}
                                    </p>
                                )}
                                {sheetStatus()}
                                {failed('sheet')}
                                <ReaderNotes reading={sheet.reading} />
                                <div className="flex flex-wrap gap-1">
                                    {/* A read again after a reading, or for an uploaded sheet whose reader never started or failed. */}
                                    {(sheet.status !== 'uploaded' || !isReading('sheet')) && (
                                        <AdminToolButton disabled={busy !== null || isReading('sheet')} onClick={onReread}>
                                            {busy === 'reread' ? spinner : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                                            {tPage('sources.sheet.reread')}
                                        </AdminToolButton>
                                    )}
                                    <AdminToolButton destructive disabled={busy !== null} onClick={remove}>
                                        {busy === 'remove' ? spinner : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                                        {tPage('sources.sheet.remove')}
                                    </AdminToolButton>
                                </div>
                            </div>
                        )}
                    </section>
                    <section>
                        <div className="text-[11px] text-muted-foreground">{tPage('sources.transcript.label')}</div>
                        <div className="mt-1 space-y-1.5">
                            {isReading('transcript') ? (
                                <p className="inline-flex items-center text-xs text-muted-foreground">
                                    {spinner}
                                    {tPage('sources.transcript.reading')}
                                </p>
                            ) : transcript?.reading ? (
                                <>
                                    <p className="text-xs">{tPage('sources.transcript.read', { date: when(transcript.updatedAt) })}</p>
                                    <p className="text-[11px] text-muted-foreground">{readingCounts(transcript.reading)}</p>
                                    <ReaderNotes reading={transcript.reading} />
                                </>
                            ) : (
                                <p className="text-xs text-muted-foreground">{tPage('sources.transcript.none')}</p>
                            )}
                            {failed('transcript')}
                            <AdminToolButton disabled={busy !== null || isReading('transcript')} onClick={onReadTranscript}>
                                {busy === 'readTranscript' ? spinner : transcript?.reading ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
                                {transcript?.reading ? tPage('sources.transcript.reread') : tPage('sources.transcript.readButton')}
                            </AdminToolButton>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
