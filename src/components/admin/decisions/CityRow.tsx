"use client";

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { CalendarX2, ChevronDown, ChevronRight, ExternalLink, Inbox, Loader2, Swords } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useToast } from '@/hooks/use-toast';
import { formatCalendarDate } from '@/lib/formatters/time';
import { RelativeTime } from '@/components/RelativeTime';
import type { CityDecisionHealth, CityState } from '@/lib/db/decisionHealth';
import type { CityDecisionDetail } from '@/lib/db/decisionHealthDetail';
import type { CandidateConflict } from '@/lib/db/decisionCandidates';
import { ConfirmSheet } from '@/components/meetings/decisions/ConfirmSheet';
import { diavgeiaDocUrl, diavgeiaSearchUrl } from '@/components/meetings/decisions/pdfUrl';
import { resolveCandidateConflict } from '@/lib/tasks/pollDecisions';
import { fetchCityDecisionDetail } from './actions';
import { buildDateGroups, type ListFilter } from './dateGroups';
import { CoverageStrip } from './CoverageStrip';
import { narrowDetailToBody } from './bodyFilter';
import { BodyRows, type BodySelection } from './BodyRows';
import { QueueBadges } from './QueueBadges';
import { ROW_GRID } from './rowLayout';

const STATE_STYLE: Record<CityState, string> = {
    blocked: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    needsTriage: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-500',
    draining: 'bg-orange-50 text-[#fc550a] dark:bg-orange-950/40',
    drained: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
    notStarted: 'bg-muted text-muted-foreground',
    outOfScope: 'bg-muted text-muted-foreground',
};

interface SheetState {
    action: 'view' | 'reassign';
    title: string | null;
    decisionNumber: string | null;
    pdfUrl: string;
    ada: string | null;
    subjectName?: string | null;
    conflict?: CandidateConflict;
    /** The meeting the document belongs to, when known — the panel links to it. */
    meetingId?: string | null;
    /** Reassign mode: the meeting of the subject holding the decision today. */
    holderMeetingId?: string | null;
}

/** A hero queue line asking this row to open on a specific filter. */
export interface OpenRequest {
    filter: ListFilter;
}

/** One city on the decisions overview; detail loads on first expansion. */
export function CityRow({ city, state, label, openRequest }: {
    city: CityDecisionHealth; state: CityState; label: string; openRequest?: OpenRequest | null;
}) {
    const t = useTranslations('admin.decisionsOverview');
    const locale = useLocale();
    const router = useRouter();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState<CityDecisionDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [sheet, setSheet] = useState<SheetState | null>(null);
    const [filter, setFilter] = useState<ListFilter>('pending');
    const [subjectsOpen, setSubjectsOpen] = useState(false);
    const [selectedBody, setSelectedBody] = useState<BodySelection | null>(null);
    const [resolving, startResolve] = useTransition();

    const containerRef = useRef<HTMLDivElement>(null);

    // The scope the expansion reads: the selected body's coverage, or the city's.
    const scope = selectedBody === null
        ? city
        : city.bodies.find(b => (b.body?.id ?? null) === selectedBody.bodyId) ?? city;
    const unlinked = scope.eligibleSubjects - scope.linkedSubjects;

    const ensureDetail = async () => {
        if (detail || loading) return;
        setLoading(true);
        try { setDetail(await fetchCityDecisionDetail(city.cityId)); }
        catch (e) {
            console.error('fetchCityDecisionDetail failed', e);
            toast({ title: t('detailError'), variant: 'destructive' });
            setOpen(false);
        }
        finally { setLoading(false); }
    };

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next) await ensureDetail();
        else setSelectedBody(null);
    };

    useEffect(() => {
        if (!openRequest) return;
        setOpen(true);
        setFilter(openRequest.filter);
        // The hero promised a city-wide queue; a body selection would hide it.
        setSelectedBody(null);
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        void ensureDetail();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when the hero sends a new request
    }, [openRequest]);

    const viewDoc = (doc: { title: string | null; decisionNumber: string | null; pdfUrl: string; ada: string }, meetingId?: string | null) =>
        setSheet({ action: 'view', title: doc.title, decisionNumber: doc.decisionNumber, pdfUrl: doc.pdfUrl, ada: doc.ada, meetingId });

    const resolveConflict = (conflict: CandidateConflict, resolution: 'reassign' | 'dismiss') => {
        startResolve(async () => {
            let outcome: Awaited<ReturnType<typeof resolveCandidateConflict>>;
            try {
                outcome = await resolveCandidateConflict(conflict.candidateId, resolution);
            } catch (e) {
                console.error('resolveCandidateConflict failed', e);
                toast({ title: t('conflict.failed'), variant: 'destructive' });
                return;
            }
            // The toast reports what actually happened — a reassign downgrades
            // to a rejection when the claiming subject got its own decision.
            toast({ title: t(`conflict.${outcome}`) });
            setSheet(null);
            // The resolution is committed; a refresh failure must not report it
            // as failed. router.refresh() re-renders the server counts too.
            try {
                const fresh = await fetchCityDecisionDetail(city.cityId);
                setDetail(fresh);
                // The selected filter's queue may have just emptied; an empty
                // list behind a vanished filter chip reads as "all gone".
                if (filter === 'conflicts' && fresh.conflicts.length === 0) setFilter('pending');
            }
            catch (e) { console.error('fetchCityDecisionDetail failed after resolve', e); }
            router.refresh();
        });
    };

    return (
        <div ref={containerRef} className="scroll-mt-4 border-b border-border/60">
            {/* The row is the pointer target; the name button is the keyboard one, so the
                Diavgeia id can be a real link beside it. */}
            <div
                onClick={toggle}
                className={`grid w-full ${ROW_GRID} cursor-pointer items-center gap-2 px-1 py-2.5 text-left hover:bg-muted/40 sm:gap-3`}
            >
                {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="flex min-w-0 flex-col">
                    <button type="button" aria-expanded={open} onClick={e => { e.stopPropagation(); void toggle(); }}
                        className="truncate text-left text-sm font-semibold">
                        {label}
                    </button>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={`w-fit rounded px-1.5 py-px text-[10px] font-semibold ${STATE_STYLE[state]}`}>{t(`state.${state}`)}</span>
                        {city.diavgeiaUid && (
                            <a href={diavgeiaSearchUrl(city.diavgeiaUid)} target="_blank" rel="noopener noreferrer"
                                title={t('bodies.openInDiavgeia')} onClick={e => e.stopPropagation()}
                                className="font-mono text-[10px] text-muted-foreground hover:text-foreground hover:underline">
                                {t('row.diavgeia')} {city.diavgeiaUid}
                            </a>
                        )}
                    </span>
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                    {city.eligibleSubjects === 0 ? (
                        <span className="text-xs text-muted-foreground">{t('row.noMeetingsInRange')}</span>
                    ) : (
                        <>
                            <span className="text-sm tabular-nums">
                                <b>{city.linkedSubjects.toLocaleString(locale)}</b>
                                <span className="text-muted-foreground"> / {city.eligibleSubjects.toLocaleString(locale)} {t('row.withDecision')}</span>
                            </span>
                            <CoverageStrip content={city.contentLinks} linked={city.linkedSubjects} eligible={city.eligibleSubjects} />
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {t('row.quality', { content: city.contentLinks.toLocaleString(locale) })}
                            </span>
                        </>
                    )}
                </span>
                <span className="hidden flex-col sm:flex">
                    {city.eligibleSubjects > 0 && (
                        <>
                            <span className="text-sm tabular-nums">{city.polledMeetings} / {city.meetings}</span>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('row.meetings')}</span>
                        </>
                    )}
                    {city.lastPollAt && (
                        <span className="text-[10px] text-muted-foreground">
                            {t('row.lastPoll')} <RelativeTime date={city.lastPollAt} />
                        </span>
                    )}
                </span>
                <span className="flex items-center justify-end gap-3 text-xs tabular-nums">
                    <QueueBadges queues={city} unplaceable={city.unplaceable.total} />
                </span>
            </div>

            {open && (
                <div className="px-5 pb-4 pt-1">
                    <BodyRows city={city} selected={selectedBody} onSelect={setSelectedBody} />
                    {loading && <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('loadingDetail')}</div>}
                    {detail && (() => {
                        const shown = selectedBody === null ? detail : narrowDetailToBody(detail, selectedBody.bodyId);
                        const noSessionDocs = shown.missingSessions.reduce((n, g) => n + g.documents.length, 0);
                        const pendingCount = shown.conflicts.length + shown.unplaced.length + noSessionDocs;
                        const filters = [
                            { key: 'pending' as const, Icon: null, label: t('filters.pending'), count: pendingCount },
                            { key: 'conflicts' as const, Icon: Swords, label: t('filters.conflicts'), count: shown.conflicts.length },
                            { key: 'unplaced' as const, Icon: Inbox, label: t('filters.unplaced'), count: shown.unplaced.length },
                            { key: 'noSession' as const, Icon: CalendarX2, label: t('filters.noSession'), count: noSessionDocs },
                        ].filter(f => f.key === 'pending' || f.count > 0);
                        // The stored filter may point at a queue that emptied
                        // since; falling back beats an empty list with no chip.
                        const effective: ListFilter = filters.some(f => f.key === filter) ? filter : 'pending';
                        const showUnplaced = effective === 'pending' || effective === 'unplaced';
                        const showNoSession = effective === 'pending' || effective === 'noSession';
                        const grouped = buildDateGroups(shown, effective);
                        return (
                            <div>
                                {shown.failedMeetings.length > 0 && (
                                    <div className="mb-2 rounded border border-red-200 bg-red-50/50 px-2 py-1.5 text-xs dark:border-red-900 dark:bg-red-950/20">
                                        <span className="mr-1 font-semibold text-red-700 dark:text-red-400">{t('row.stuck', { count: shown.failedMeetings.length })}:</span>
                                        {shown.failedMeetings.map((m, i) => (
                                            <span key={m.id}>
                                                {i > 0 && ' · '}
                                                <Link className="hover:underline" href={`/${city.cityId}/${m.id}`}>
                                                    {formatCalendarDate(m.sessionDate, locale)}
                                                </Link>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {pendingCount === 0 ? (
                                    <p className="py-1 text-sm text-muted-foreground">{t('sections.nothingWaiting')}</p>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap gap-1.5">
                                            {filters.map(f => (
                                                <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                                                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs tabular-nums ${effective === f.key
                                                        ? 'border-foreground bg-foreground font-semibold text-background'
                                                        : 'text-muted-foreground hover:text-foreground'}`}>
                                                    {f.Icon && <f.Icon className="h-3.5 w-3.5" aria-hidden />}{f.label} {f.count}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="mt-1.5 text-[11px] text-muted-foreground">{t(`filters.${effective}Desc`)}</p>
                                        <ul className="mt-2">
                                            {grouped.map(g => (
                                                <li key={g.date} className="border-b border-border/60 pb-1">
                                                    <div className="px-1 pt-1.5 text-[11px] text-muted-foreground">
                                                        {formatCalendarDate(g.date, locale)}
                                                        {g.missingKind && <span className="ml-1">({t(`missing.${g.missingKind}`)})</span>}
                                                    </div>
                                                    <ul>
                                                        {g.rows.map(r => r.kind === 'conflict' ? (
                                                            <li key={`c-${r.cf.candidateId}`}>
                                                                <button type="button"
                                                                    onClick={() => setSheet({
                                                                        action: 'reassign',
                                                                        title: r.cf.existingDecision?.title ?? null,
                                                                        decisionNumber: null,
                                                                        pdfUrl: r.cf.existingDecision?.pdfUrl ?? diavgeiaDocUrl(r.cf.ada),
                                                                        ada: r.cf.ada,
                                                                        subjectName: r.cf.claimingSubject.name,
                                                                        conflict: r.cf,
                                                                        meetingId: r.cf.claimingSubject.councilMeetingId,
                                                                        holderMeetingId: r.cf.existingDecision?.currentSubject.councilMeetingId,
                                                                    })}
                                                                    className="flex w-full items-baseline gap-2 bg-amber-50/40 px-1 py-1 text-left text-xs hover:bg-amber-50 dark:bg-amber-950/20 dark:hover:bg-amber-950/40">
                                                                    <Swords className="h-3.5 w-3.5 shrink-0 self-center text-amber-700 dark:text-amber-500" aria-hidden />
                                                                    <span className="shrink-0 font-mono">{r.cf.ada}</span>
                                                                    <span className="min-w-0 flex-1 truncate">{r.cf.existingDecision?.title}</span>
                                                                    <span className="shrink-0 text-amber-700 dark:text-amber-500">{t('conflict.claims', { subject: r.cf.claimingSubject.name })}</span>
                                                                </button>
                                                            </li>
                                                        ) : r.kind === 'unplaced' ? (
                                                            <li key={`u-${r.u.id}`}>
                                                                <button type="button"
                                                                    className="flex w-full items-baseline gap-2 px-1 py-1 text-left text-xs hover:bg-muted/40"
                                                                    onClick={() => viewDoc(r.u, r.u.councilMeetingId)}>
                                                                    <Inbox className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
                                                                    <span className="shrink-0 font-mono">{r.u.decisionNumber ?? r.u.ada}</span>
                                                                    <span className="min-w-0 truncate">{r.u.title ?? r.u.ada}</span>
                                                                </button>
                                                            </li>
                                                        ) : (
                                                            <li key={`o-${r.d.ada}`}>
                                                                <button type="button"
                                                                    className="flex w-full items-baseline gap-2 px-1 py-1 text-left text-xs hover:bg-muted/40"
                                                                    onClick={() => viewDoc(r.d)}>
                                                                    <CalendarX2 className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
                                                                    <span className="shrink-0 font-mono">{r.d.decisionNumber ?? r.d.ada}</span>
                                                                    <span className="min-w-0 truncate">{r.d.title ?? r.d.ada}</span>
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </li>
                                            ))}
                                        </ul>
                                        {showUnplaced && selectedBody === null && city.unplacedUnread > 0 && (
                                            <p className="mt-2 text-xs text-muted-foreground">{t('sections.unreadBackfill', { count: city.unplacedUnread })}</p>
                                        )}
                                        {showNoSession && noSessionDocs > 0 && (
                                            <p className="mt-2 text-[11px] text-muted-foreground">{t('missing.hint')}</p>
                                        )}
                                    </>
                                )}

                                {selectedBody !== null && city.unplaceable.total > 0 && (
                                    <p className="mt-1.5 text-[11px] text-muted-foreground">{t('bodies.orphansHidden')}</p>
                                )}

                                {/* The subject-side residue, tucked away exactly like the
                                    meeting page tucks its unfiled documents. */}
                                {unlinked > 0 && (
                                    <div className="mt-3 border-t border-border/60 pt-2">
                                        <button type="button" onClick={() => setSubjectsOpen(!subjectsOpen)}
                                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                            {subjectsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                            {t('sections.withoutDecision')} ({unlinked.toLocaleString(locale)})
                                        </button>
                                        {subjectsOpen && (
                                            <div className="mt-2 max-w-xl pl-4">
                                                <TaxonomyList label={t('taxonomy.notProcessed')} cityId={city.cityId}
                                                    count={scope.unmatchedTaxonomy.notProcessed}
                                                    meetings={shown.unmatched.notProcessed} openLabel={t('openMeeting')} />
                                                <TaxonomyList label={t('taxonomy.candidatesUnmatched')} cityId={city.cityId}
                                                    count={scope.unmatchedTaxonomy.candidatesUnmatched}
                                                    meetings={groupSubjectsByMeeting(shown.unmatched.candidatesUnmatched)} openLabel={t('openMeeting')} />
                                                <TaxonomyList label={t('taxonomy.nothingFetched')} cityId={city.cityId}
                                                    count={scope.unmatchedTaxonomy.nothingFetched}
                                                    meetings={groupSubjectsByMeeting(shown.unmatched.nothingFetched)} openLabel={t('openMeeting')} />
                                                <TaxonomyList label={t('taxonomy.duplicateSubject')} cityId={city.cityId}
                                                    count={scope.unmatchedTaxonomy.duplicateSubject}
                                                    meetings={groupSubjectsByMeeting(shown.unmatched.duplicateSubject)} openLabel={t('openMeeting')} />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}

            {sheet && (
                <ConfirmSheet
                    open
                    onOpenChange={o => { if (!o && !resolving) setSheet(null); }}
                    action={sheet.action}
                    destructive={false}
                    decisionTitle={sheet.title}
                    decisionNumber={sheet.decisionNumber}
                    subjectName={sheet.subjectName ?? null}
                    holderName={sheet.conflict?.existingDecision?.currentSubject.name ?? null}
                    pdfUrl={sheet.pdfUrl}
                    ada={sheet.ada}
                    busy={resolving}
                    onConfirm={() => sheet.conflict && resolveConflict(sheet.conflict, 'reassign')}
                    onDismiss={sheet.action === 'reassign' && sheet.conflict ? () => resolveConflict(sheet.conflict!, 'dismiss') : undefined}
                    meetingLink={(sheet.meetingId || sheet.holderMeetingId) ? (
                        <>
                            {sheet.meetingId && (
                                <Link href={`/${city.cityId}/${sheet.meetingId}/decisions`}
                                    className="inline-flex items-center gap-1 text-xs text-[#fc550a] hover:underline">
                                    {t(sheet.action === 'reassign' ? 'conflict.claimantMeeting' : 'openMeeting')}
                                    <ExternalLink className="h-3 w-3" />
                                </Link>
                            )}
                            {sheet.holderMeetingId && sheet.holderMeetingId !== sheet.meetingId && (
                                <Link href={`/${city.cityId}/${sheet.holderMeetingId}/decisions`}
                                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                                    {t('conflict.holderMeeting')}
                                    <ExternalLink className="h-3 w-3" />
                                </Link>
                            )}
                        </>
                    ) : undefined}
                />
            )}
        </div>
    );
}

/** The actionable unit of the subject-side residue is the meeting. */
function groupSubjectsByMeeting(subjects: Array<{ councilMeetingId: string; sessionDate: string }>) {
    const meetings = new Map<string, { councilMeetingId: string; sessionDate: string; subjects: number }>();
    for (const s of subjects) {
        const m = meetings.get(s.councilMeetingId) ?? { councilMeetingId: s.councilMeetingId, sessionDate: s.sessionDate, subjects: 0 };
        m.subjects += 1;
        meetings.set(s.councilMeetingId, m);
    }
    return [...meetings.values()];
}

function TaxonomyList({ label, count, meetings, cityId, openLabel }: {
    label: string; count: number; cityId: string;
    meetings: Array<{ councilMeetingId: string; sessionDate: string; subjects: number }>; openLabel: string;
}) {
    const t = useTranslations('admin.decisionsOverview');
    const locale = useLocale();
    const [open, setOpen] = useState(false);
    if (count === 0) return null;
    const rows = [...meetings].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
    return (
        <div className="mb-1.5">
            <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-baseline justify-between gap-2 text-left text-xs hover:underline">
                <span>{label}</span>
                <span className="tabular-nums text-muted-foreground">{count}</span>
            </button>
            {open && (
                <ul className="mt-1 space-y-0.5 pl-1">
                    {rows.map(m => (
                        <li key={m.councilMeetingId} className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                                {formatCalendarDate(m.sessionDate, locale)}
                                {' · '}{t('taxonomy.subjectCount', { count: m.subjects })}
                            </span>
                            <Link className="shrink-0 text-[#fc550a] hover:underline" href={`/${cityId}/${m.councilMeetingId}/decisions`}>
                                {openLabel} <ExternalLink className="inline h-3 w-3" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
