"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import type { FactSourceReadState, MeetingFactSourceRow } from '@/lib/db/meetingFactSources';
import type { MeetingFactsReading } from '@/lib/apiTypes';
import { requestReadTranscriptFacts } from '@/lib/actions/meetingFacts';

export type FactSourceKind = 'sheet' | 'transcript';

/** A source's row as the sheet route serves it: the dates are ISO strings over JSON, and the reading is typed. */
export type MeetingFactSource = Omit<MeetingFactSourceRow, 'reading' | 'confirmedAt' | 'createdAt' | 'updatedAt'> & {
    reading: MeetingFactsReading | null;
    confirmedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type FactSourceAction = 'upload' | 'reread' | 'remove' | 'readTranscript';

/** A reader on its way, and how the page tells that its result landed. */
export interface PendingRead {
    source: FactSourceKind;
    taskId: string;
    /** The sheet row's `updatedAt` when the read started; the result changes it. Null for a fresh upload. */
    baselineUpdatedAt: string | null;
}

/** How often the page asks for the sources while a reader is on its way, and for how long. */
const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 60;

export interface MeetingFactSourcesState {
    /** Null until the first load returns. */
    sources: MeetingFactSource[] | null;
    loadFailed: boolean;
    busy: FactSourceAction | null;
    /** Whether a reader is on its way for the source. */
    isReading: (source: FactSourceKind) => boolean;
    /** The failure of the source's latest read, when it failed; null otherwise. */
    failure: (source: FactSourceKind) => string | null;
    refresh: () => Promise<void>;
    upload: (file: File) => Promise<void>;
    reread: () => Promise<void>;
    remove: () => Promise<void>;
    readTranscript: () => Promise<void>;
}

/** The route's own sentence for a refused request, or the status when it sent none. */
async function readError(response: Response): Promise<Error> {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    return new Error(body?.error ?? `HTTP ${response.status}`);
}

/** Whether the row was written after the read was asked for: a newer reading than the one the read would bring. */
const storedSince = (row: MeetingFactSource | undefined, read: FactSourceReadState) => !!row && Date.parse(row.updatedAt) > Date.parse(read.createdAt);

/**
 * The failure of a source's latest read, when that read is about what the page
 * shows now. A sheet's failed read counts only while the row still holds that
 * task: a replaced sheet clears its task, and the old file's error must not
 * stand beside the new file. The transcript's counts until a reading lands
 * after it: `fixTranscript` also reads the transcript, and its newer reading
 * makes the older failure moot.
 */
export function failureOf(source: FactSourceKind, rows: MeetingFactSource[] | null, read: FactSourceReadState | null): string | null {
    if (!read || read.status !== 'failed') return null;
    const row = rows?.find(r => r.source === source);
    if (source === 'sheet' && row?.taskId !== read.taskId) return null;
    if (source === 'transcript' && storedSince(row, read)) return null;
    return read.error ?? '';
}

export function landed(pending: PendingRead, rows: MeetingFactSource[], read: FactSourceReadState | null = null): boolean {
    const row = rows.find(r => r.source === pending.source);
    // The transcript's row is created by its result; a sheet's row is gone only when the sheet was removed.
    if (!row) return pending.source !== 'transcript';
    if (pending.source === 'transcript') {
        if (row.taskId === pending.taskId) return true;
        // The read finished and a newer reading (a `fixTranscript` run) was stored
        // after it was asked for: its own result was dropped as older, and there is
        // nothing more to wait for.
        return !!read && read.taskId === pending.taskId && read.status === 'succeeded' && storedSince(row, read);
    }
    if (row.taskId !== pending.taskId || row.status === 'uploaded') return false;
    return pending.baselineUpdatedAt === null || row.updatedAt !== pending.baselineUpdatedAt;
}

/**
 * The meeting's sources beside the decision documents (issue #807): the
 * attendance sheet and the transcript. The page owns the rows and every
 * action on them; the rail's card and the review sheet only show and edit.
 *
 * A reader runs on the task server, so nothing tells the page when it lands.
 * While one is on its way the page asks for the sources every ten seconds,
 * and when a result lands it refetches the facts too: the transcript's result
 * re-derives the meeting on the server.
 */
export function useMeetingFactSources({ cityId, meetingId, enabled, onFactsChanged }: {
    cityId: string;
    meetingId: string;
    /** The sheet route is superadmin-only; nobody else loads it. */
    enabled: boolean;
    /** The page's refetch of the decisions and the minutes. */
    onFactsChanged: () => Promise<void>;
}): MeetingFactSourcesState {
    const { toast } = useToast();
    const tPage = useTranslations('admin.decisionsPage');
    const [sources, setSources] = useState<MeetingFactSource[] | null>(null);
    const [reads, setReads] = useState<Record<FactSourceKind, FactSourceReadState | null>>({ sheet: null, transcript: null });
    const [loadFailed, setLoadFailed] = useState(false);
    const [busy, setBusy] = useState<FactSourceAction | null>(null);
    const [pending, setPending] = useState<PendingRead[]>([]);
    /** True once a read outlived the poll cap: the page stops asking until the next action. */
    const [gaveUp, setGaveUp] = useState(false);
    const polls = useRef(0);
    const baseUrl = `/api/cities/${cityId}/meetings/${meetingId}/sheet`;

    const fetchSources = useCallback(async (): Promise<{ rows: MeetingFactSource[]; reads: Record<FactSourceKind, FactSourceReadState | null> } | null> => {
        try {
            const response = await fetch(baseUrl);
            if (!response.ok) { setLoadFailed(true); return null; }
            const data = await response.json() as { sources: MeetingFactSource[]; reads?: Record<FactSourceKind, FactSourceReadState | null> };
            const latest = data.reads ?? { sheet: null, transcript: null };
            setSources(data.sources);
            setReads(latest);
            setLoadFailed(false);
            return { rows: data.sources, reads: latest };
        } catch {
            setLoadFailed(true);
            return null;
        }
    }, [baseUrl]);

    const refresh = useCallback(async () => { await fetchSources(); }, [fetchSources]);

    useEffect(() => {
        if (enabled) void fetchSources();
    }, [enabled, fetchSources]);

    // An uploaded sheet is one a reader is on its way for: the row holds the
    // reader's task, and that read did not fail. A row with no task is a sheet
    // whose reader never started, and the card offers to start it.
    const sheetUploaded = (sources?.some(s => s.source === 'sheet' && s.status === 'uploaded' && s.taskId !== null) ?? false) && failureOf('sheet', sources, reads.sheet) === null;
    const polling = enabled && !gaveUp && (pending.length > 0 || sheetUploaded);

    useEffect(() => {
        if (!polling) { polls.current = 0; return; }
        const timer = setInterval(async () => {
            polls.current += 1;
            if (polls.current > MAX_POLLS) { setPending([]); setGaveUp(true); return; }
            const fetched = await fetchSources();
            if (!fetched) return;
            const { rows, reads: latest } = fetched;
            const done = pending.filter(p => landed(p, rows, latest[p.source]));
            if (done.length === 0) return;
            setPending(prev => prev.filter(p => !done.includes(p)));
            await onFactsChanged();
        }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [polling, pending, fetchSources, onFactsChanged]);

    const fail = useCallback((error: unknown) => {
        toast({ title: tPage('sources.actionFailed'), description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    }, [toast, tPage]);

    const upload = useCallback(async (file: File) => {
        setBusy('upload');
        try {
            const form = new FormData();
            form.append('file', file);
            const response = await fetch(baseUrl, { method: 'PUT', body: form });
            if (!response.ok) throw await readError(response);
            const data = await response.json() as { source: MeetingFactSource; taskId: string | null; error?: string | null };
            if (data.taskId) setPending(prev => [...prev.filter(p => p.source !== 'sheet'), { source: 'sheet', taskId: data.taskId!, baselineUpdatedAt: null }]);
            // The file is up and stays; only the reader did not start. The card offers a read again.
            if (data.error) toast({ title: tPage('sources.sheet.readerNotStarted'), description: data.error, variant: 'destructive' });
            setGaveUp(false);
            await fetchSources();
            // A replaced sheet's confirmed reading is gone, and so are the rows derived from it.
            await onFactsChanged();
        } catch (error) {
            fail(error);
        } finally {
            setBusy(null);
        }
    }, [baseUrl, fetchSources, onFactsChanged, fail]);

    const reread = useCallback(async () => {
        setBusy('reread');
        try {
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reread' }),
            });
            if (!response.ok) throw await readError(response);
            const data = await response.json() as { taskId: string };
            const fetched = await fetchSources();
            const row = fetched?.rows.find(r => r.source === 'sheet');
            setPending(prev => [...prev.filter(p => p.source !== 'sheet'), { source: 'sheet', taskId: data.taskId, baselineUpdatedAt: row?.updatedAt ?? null }]);
            setGaveUp(false);
        } catch (error) {
            fail(error);
        } finally {
            setBusy(null);
        }
    }, [baseUrl, fetchSources, fail]);

    const remove = useCallback(async () => {
        setBusy('remove');
        try {
            const response = await fetch(baseUrl, { method: 'DELETE' });
            if (!response.ok) throw await readError(response);
            setPending(prev => prev.filter(p => p.source !== 'sheet'));
            await fetchSources();
            await onFactsChanged();
        } catch (error) {
            fail(error);
        } finally {
            setBusy(null);
        }
    }, [baseUrl, fetchSources, onFactsChanged, fail]);

    const readTranscript = useCallback(async () => {
        setBusy('readTranscript');
        try {
            const { taskId } = await requestReadTranscriptFacts(cityId, meetingId);
            setPending(prev => [...prev.filter(p => p.source !== 'transcript'), { source: 'transcript', taskId, baselineUpdatedAt: null }]);
            setGaveUp(false);
        } catch (error) {
            fail(error);
        } finally {
            setBusy(null);
        }
    }, [cityId, meetingId, fail]);

    // A read that failed is over: the wait for it ends, and the card says so.
    useEffect(() => {
        const failed = pending.filter(p => reads[p.source]?.taskId === p.taskId && reads[p.source]?.status === 'failed');
        if (failed.length === 0) return;
        setPending(prev => prev.filter(p => !failed.includes(p)));
    }, [pending, reads]);

    const isReading = useCallback((source: FactSourceKind) => {
        if (pending.some(p => p.source === source)) return true;
        return source === 'sheet' && sheetUploaded;
    }, [pending, sheetUploaded]);

    const failure = useCallback((source: FactSourceKind) => failureOf(source, sources, reads[source]), [sources, reads]);

    return { sources, loadFailed, busy, isReading, failure, refresh, upload, reread, remove, readTranscript };
}
