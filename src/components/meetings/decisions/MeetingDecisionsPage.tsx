"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { DecisionWithSource, MeetingAttendanceRecord, SubjectExtractedData } from '@/lib/db/decisions';
import { getPollingHistoryForMeeting, requestPollDecisions, resolveCandidateConflict } from '@/lib/tasks/pollDecisions';
import { calculateVoteResult } from '@/lib/utils/votes';
import { formatDate, formatRelativeTime } from '@/lib/formatters/time';
import { categorizeSubjectsInAgendaOrder, getSubjectCategories, getWithdrawnLabel, subjectCategory } from '@/lib/utils/subjects';
import { isMayorRole, isRoleActiveAt } from '@/lib/utils/roles';
import { parseDiavgeiaUnitScopes } from '@/lib/utils/diavgeiaUnitScope';
import { AdminOnly, AdminToolButton } from '@/components/admin/AdminStrip';
import { CollapsibleMarkdown, NameList, sortNamesByElectedOrder } from './shared';
import { computeDecisionStats } from './stats';
import { ConfirmSheet, type SubjectOption } from './ConfirmSheet';
import { AttentionCard, type Receipt } from './AttentionCard';
import { DecisionsTable } from './DecisionsTable';
import { AdminTools } from './AdminTools';
import { buildAttention, estimateWork, type AttentionSubject, type CandidateView, type Conflict } from './attention';
import type { ManualEntry } from './ManualEntryForm';

/** The document fields every sheet action carries, projected once. */
interface DecisionDoc {
    title: string | null;
    decisionNumber: string | null;
    pdfUrl: string;
    ada: string | null;
}

const docOfCandidate = (c: CandidateView): DecisionDoc =>
    ({ title: c.title, decisionNumber: c.decisionNumber, pdfUrl: c.pdfUrl, ada: c.ada });

/** decisionNumber falls back to Diavgeia's filing protocol until backfilled. */
const docOfDecision = (d: DecisionWithSource): DecisionDoc =>
    ({ title: d.title, decisionNumber: d.decisionNumber || d.protocolNumber, pdfUrl: d.pdfUrl, ada: d.ada });

/** The decision a new link replaces: unlinked in the same confirmation. */
interface Replacing {
    decisionNumber: string;
    /** No candidate backs it: the unlink deletes it and its extracted data for good. */
    destructive: boolean;
}

/** A link-changing action awaiting confirmation in the sheet. */
type PendingAction =
    | ({ action: 'assign'; candidateId: string; subjectId: string; subjectName: string; replacing: Replacing | null } & DecisionDoc)
    | ({ action: 'link'; subjectId: string; subjectName: string; protocolNumber: string | null; replacing: Replacing | null } & DecisionDoc)
    | ({ action: 'unlink'; subjectId: string; subjectName: string; destructive: boolean } & DecisionDoc)
    | ({ action: 'dismiss'; candidateId: string; subjectName: string | null } & DecisionDoc)
    | ({ action: 'inspect'; candidateId: string; subjectId: string | null; subjectName: string | null } & DecisionDoc)
    | ({ action: 'reassign'; candidateId: string; subjectId: string; subjectName: string; holderName: string } & DecisionDoc)
    | ({ action: 'view'; subjectId: string | null; subjectName: string | null; sourceLabel: string | null } & DecisionDoc);

/** Receipts stay on screen for the visit; older ones scroll off the top. */
const MAX_RECEIPTS = 5;

export function MeetingDecisionsPage({ isSuperAdmin }: { isSuperAdmin: boolean }) {
    const { toast } = useToast();
    const locale = useLocale();
    const { subjects, meeting, city, people, getPerson } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const tPage = useTranslations('admin.decisionsPage');
    const tAttention = useTranslations('admin.decisionsPage.attention');
    const tReceipts = useTranslations('admin.decisionsPage.receipts');
    const tPicker = useTranslations('admin.decisionsPage.picker');
    const tSheet = useTranslations('admin.decisionsPage.sheet');
    const tConflict = useTranslations('admin.decisionsOverview.conflict');
    const tSubject = useTranslations('Subject');
    const tCommon = useTranslations('Common');
    const administrativeBodyId = meeting.administrativeBodyId ?? null;
    // What a poll would actually ask Diavgeia for. Parsed through the same
    // helper the task uses, so a malformed entry surfaces here — in the admin
    // page, before it fails a poll — rather than only in the task log.
    const pollScope = useMemo(() => {
        const entries = meeting.administrativeBody?.diavgeiaUnitIds ?? [];
        try {
            return { scopes: parseDiavgeiaUnitScopes(entries), error: null as string | null };
        } catch (e) {
            return { scopes: [], error: e instanceof Error ? e.message : String(e) };
        }
    }, [meeting.administrativeBody?.diavgeiaUnitIds]);
    const meetingDate = new Date(meeting.dateTime);
    const mayorPersonId = people.find(p =>
        p.roles.some(r => isRoleActiveAt(r, meetingDate) && isMayorRole(r))
    )?.id ?? null;
    const [decisions, setDecisions] = useState<Record<string, DecisionWithSource>>({});
    const [candidates, setCandidates] = useState<CandidateView[]>([]);
    const [candidateBusy, setCandidateBusy] = useState<string | null>(null);
    const [extractedData, setExtractedData] = useState<Record<string, SubjectExtractedData>>({});
    const [meetingAttendance, setMeetingAttendance] = useState<MeetingAttendanceRecord[]>([]);
    const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
    const [removingSubjectId, setRemovingSubjectId] = useState<string | null>(null);
    const [resettingSubjectId, setResettingSubjectId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    // Mirrors hasLoaded for the fetch callback, whose identity must not change with it.
    const hasLoadedRef = useRef(false);
    const [pollingStatus, setPollingStatus] = useState<Awaited<ReturnType<typeof getPollingHistoryForMeeting>> | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [skipCache, setSkipCache] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [unplacedOpen, setUnplacedOpen] = useState(false);
    const [subjectQuery, setSubjectQuery] = useState('');
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    // The sheet stays mounted while it animates out — same dismissable-layer
    // bug as the modal={false} note that used to sit on the row menu.
    const lastActionRef = useRef<PendingAction | null>(null);
    if (pendingAction) lastActionRef.current = pendingAction;
    const sheetAction = pendingAction ?? lastActionRef.current;

    const fetchDecisions = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`);
            if (!response.ok) {
                // An empty page and a failed load must not look the same: 0/N
                // linked would invite re-linking work that already exists.
                if (hasLoadedRef.current) toast({ title: tPage('status.loadFailed'), description: `HTTP ${response.status}`, variant: 'destructive' });
                setLoadFailed(true);
                return;
            }
            const data: { decisions: DecisionWithSource[]; extractedData: SubjectExtractedData[]; meetingAttendance: MeetingAttendanceRecord[]; candidates?: CandidateView[] } = await response.json();
            const decisionMap: Record<string, DecisionWithSource> = {};
            for (const d of data.decisions) {
                decisionMap[d.subjectId] = d;
            }
            setDecisions(decisionMap);
            setCandidates(data.candidates ?? []);
            const extractedMap: Record<string, SubjectExtractedData> = {};
            for (const e of data.extractedData) {
                extractedMap[e.subjectId] = e;
            }
            setExtractedData(extractedMap);
            setMeetingAttendance(data.meetingAttendance || []);
            setLoadFailed(false);
            setHasLoaded(true);
            hasLoadedRef.current = true;
        } catch {
            if (hasLoadedRef.current) toast({ title: tPage('status.loadFailed'), variant: 'destructive' });
            setLoadFailed(true);
        } finally {
            setIsLoading(false);
        }
    }, [meeting.cityId, meeting.id]);

    const refreshPollingStatus = useCallback(() => {
        getPollingHistoryForMeeting(meeting.cityId, meeting.id)
            .then(setPollingStatus)
            .catch(() => { /* silent */ });
    }, [meeting.cityId, meeting.id]);

    useEffect(() => {
        fetchDecisions();
        refreshPollingStatus();
    }, [fetchDecisions, refreshPollingStatus]);

    const pushReceipt = (receipt: Omit<Receipt, 'id'>) =>
        setReceipts(prev => [...prev, { ...receipt, id: `${Date.now()}-${prev.length}` }].slice(-MAX_RECEIPTS));

    /** The one-line vote outcome sentence for the sheet's extraction tab. */
    const voteSummaryText = (voteResult: ReturnType<typeof calculateVoteResult>): string => {
        const main = voteResult.isUnanimous
            ? tPage('unanimous', { count: voteResult.forCount })
            : voteResult.passed
                ? tPage('majorityVote', { for: voteResult.forCount, against: voteResult.againstCount })
                : tPage('rejected', { against: voteResult.againstCount, for: voteResult.forCount });
        const abstain = !voteResult.isUnanimous && voteResult.abstainCount > 0
            ? `, ${voteResult.abstainCount} ${tPage('voteAbstain')}`
            : '';
        return main + abstain;
    };

    const handleSave = async (link: Extract<PendingAction, { action: 'link' }>) => {
        setSavingSubjectId(link.subjectId);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subjectId: link.subjectId,
                    pdfUrl: link.pdfUrl,
                    ada: link.ada ?? undefined,
                    decisionNumber: link.decisionNumber ?? undefined,
                    protocolNumber: link.protocolNumber ?? undefined,
                    title: link.title ?? undefined,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.error ?? 'Failed to save decision');
            }

            await fetchDecisions();

            // Extraction runs automatically on a manual link: the poll's
            // re-extraction path picks up the excerpt-less decision.
            try {
                await requestPollDecisions(meeting.cityId, meeting.id);
                toast({ title: tPage('extractionStarted') });
            } catch {
                toast({ title: tPage('extractionStartFailed'), variant: 'destructive' });
            }
            return true;
        } catch (error) {
            toast({ title: t('toasts.errorSavingDecision.title'), description: `${error}`, variant: 'destructive' });
            return false;
        } finally {
            setSavingSubjectId(null);
        }
    };

    /** Unlink a subject's decision. `quiet` skips the toast when a replacement follows. */
    const handleRemove = async (subjectId: string, quiet = false) => {
        setRemovingSubjectId(subjectId);
        try {
            const response = await fetch(
                `/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions?subjectId=${subjectId}`,
                { method: 'DELETE' }
            );
            if (!response.ok) throw new Error('Failed to remove decision');
            if (!quiet) toast({ title: tPage('decisionRemoved') });
            await fetchDecisions();
            return true;
        } catch (error) {
            toast({ title: t('toasts.errorRemovingDecision.title'), description: `${error}`, variant: 'destructive' });
            return false;
        } finally {
            setRemovingSubjectId(null);
        }
    };

    const handleAssignCandidate = async (candidateId: string, subjectId: string) => {
        setCandidateBusy(candidateId);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'assignCandidate', candidateId, subjectId }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => null);
                throw new Error(err?.error ?? 'Assignment failed');
            }
            await fetchDecisions();
            return true;
        } catch (error) {
            toast({ title: `${error instanceof Error ? error.message : error}`, variant: 'destructive' });
            return false;
        } finally {
            setCandidateBusy(null);
        }
    };

    const handleDismissCandidate = async (candidateId: string) => {
        setCandidateBusy(candidateId);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dismissCandidate', candidateId }),
            });
            if (!response.ok) throw new Error('Dismiss failed');
            await fetchDecisions();
            return true;
        } catch (error) {
            toast({ title: `${error}`, variant: 'destructive' });
            return false;
        } finally {
            setCandidateBusy(null);
        }
    };

    const handleResetExtraction = async (subjectId: string) => {
        setResettingSubjectId(subjectId);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'resetExtraction', subjectId }),
            });
            if (!response.ok) throw new Error('Failed to reset extraction');
            toast({ title: tPage('extractionReset') });
            await fetchDecisions();
        } catch (error) {
            toast({ title: tPage('resetError'), description: `${error}`, variant: 'destructive' });
        } finally {
            setResettingSubjectId(null);
        }
    };

    const handlePollDecisions = async () => {
        setIsPolling(true);
        try {
            await requestPollDecisions(meeting.cityId, meeting.id, skipCache ? { forceExtract: true } : undefined);
            toast({ title: tPage('pollRequested') });
        } catch (error) {
            toast({
                title: tPage('pollError'),
                description: `${error}`,
                variant: 'destructive',
            });
        } finally {
            setIsPolling(false);
        }
    };

    const handleClearExtractedData = async () => {
        if (!confirm(tPage('resetExtractionsConfirm'))) return;
        setIsClearing(true);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clearExtractedData' }),
            });
            if (!response.ok) throw new Error('Failed to reset extractions');
            const result = await response.json();
            toast({ title: `${tPage('resetExtractions')}: ${result.clearedCount}` });
            await fetchDecisions();
        } catch (error) {
            toast({ title: tPage('resetError'), description: `${error}`, variant: 'destructive' });
        } finally {
            setIsClearing(false);
        }
    };

    /** Settle a contested ADA. `keep` leaves it with its holder; `move` gives it to the claimant. */
    const handleResolveConflict = async (conflict: Conflict, resolution: 'reassign' | 'dismiss') => {
        setCandidateBusy(conflict.candidate.id);
        try {
            const outcome = await resolveCandidateConflict(conflict.candidate.id, resolution);
            // The receipt reports what actually happened — a reassign downgrades
            // to a rejection when the claiming subject got its own decision.
            const number = conflict.candidate.decisionNumber || conflict.candidate.ada;
            if (outcome === 'reassigned') {
                if (conflict.claimant) pushReceipt({ text: tReceipts('moved', { number, subject: subjectRef(conflict.claimant) }) });
            } else if (outcome === 'dismissed') {
                pushReceipt({ text: tReceipts('kept', { number, subject: conflict.holder ? subjectRef(conflict.holder) : `«${conflict.holderName}»` }) });
            } else {
                toast({ title: tConflict('noop') });
            }
            await fetchDecisions();
            return true;
        } catch (error) {
            console.error('resolveCandidateConflict failed', error);
            toast({ title: tConflict('failed'), variant: 'destructive' });
            return false;
        } finally {
            setCandidateBusy(null);
        }
    };

    // The buckets and the order of the meeting sidebar, so the clerk reads one
    // list in two places: out-of-agenda items first, then the agenda by number.
    // Pre-agenda announcements never get a decision; the table lists them folded.
    const { beforeAgenda: beforeAgendaSubjects, outOfAgenda: outOfAgendaSubjects, agenda: agendaSubjects } = categorizeSubjectsInAgendaOrder(subjects);
    const allDisplaySubjects = [...outOfAgendaSubjects, ...agendaSubjects];
    const eligibleSubjects = allDisplaySubjects.filter(s => !s.withdrawn);
    const extractedSubjects = eligibleSubjects.filter(s => {
        const decision = decisions[s.id];
        return (decision?.excerpt) || extractedData[s.id];
    });
    const subjectById = new Map(allDisplaySubjects.map(s => [s.id, s]));

    const attention = buildAttention(allDisplaySubjects, decisions, candidates);
    const estimate = estimateWork(attention);
    const proposalSubjectIds = new Set(attention.proposals.map(p => p.subject.id));
    const proposalBySubject = new Map(attention.proposals.map(p => [p.subject.id, p]));
    const pickableCandidates = candidates.filter(c => !c.conflict);
    const stats = computeDecisionStats(eligibleSubjects.map(s => s.id), decisions, candidates);

    const subjectCategories = getSubjectCategories(tSubject);
    /** "Θέμα 9", or the register label of a subject without a number; null when it has neither. */
    const subjectLabel = (subject: AttentionSubject): string | null => {
        if (subject.agendaItemIndex !== null) return tAttention('subjectLabel', { n: subject.agendaItemIndex });
        const category = subjectCategory(subject);
        return category && category !== 'agenda' ? subjectCategories[category].shortLabel : null;
    };
    /** "Θέμα 9 · Name", or just the name. */
    const subjectText = (subject: AttentionSubject): string => {
        const label = subjectLabel(subject);
        return label ? `${label} · ${subject.name}` : subject.name;
    };
    /** The inline form of the same: "θέμα 9", or the name in quotes. */
    const subjectRef = (subject: AttentionSubject): string =>
        subject.agendaItemIndex !== null ? tAttention('subjectRef', { n: subject.agendaItemIndex }) : `«${subject.name}»`;
    /** The link button's label: "Σύνδεση με το θέμα 9", or plain "Σύνδεση" when a name would not fit. */
    const linkLabel = (subject: AttentionSubject): string =>
        subject.agendaItemIndex !== null ? tPicker('linkTo', { subject: subjectRef(subject) }) : tPicker('link');

    const replacingOf = (decision: DecisionWithSource | null): Replacing | null =>
        decision ? { decisionNumber: docOfDecision(decision).decisionNumber || decision.ada || '', destructive: !(decision.candidateBacked ?? false) } : null;

    /** Subjects a document can still go to, for the sheet's picker. */
    const subjectOptions: SubjectOption[] = eligibleSubjects
        .filter(s => !decisions[s.id])
        .map(s => {
            const proposal = proposalBySubject.get(s.id);
            return {
                id: s.id,
                label: subjectText(s),
                hint: proposal ? tPicker('foundHint', { number: proposal.candidate.decisionNumber || proposal.candidate.ada }) : null,
            };
        });

    /** Run the sheet-confirmed action; close the sheet only when it succeeds,
     * so a failure keeps the document context for the retry. */
    const confirmPending = async () => {
        if (!pendingAction) return;
        let ok: boolean;
        if (pendingAction.action === 'assign' || pendingAction.action === 'inspect') {
            if (pendingAction.subjectId === null) return;
            const subject = subjectById.get(pendingAction.subjectId);
            const replacing = pendingAction.action === 'assign' ? pendingAction.replacing : null;
            // A replacement unlinks the current decision in the same confirmation.
            const cleared = replacing ? await handleRemove(pendingAction.subjectId, true) : true;
            ok = cleared && await handleAssignCandidate(pendingAction.candidateId, pendingAction.subjectId);
            if (ok && subject) {
                pushReceipt({
                    text: tReceipts('linked', { subject: subjectText(subject), number: pendingAction.decisionNumber || pendingAction.ada || '' }),
                    // Undo unlinks again: offered only where that restores what was there before.
                    undo: !replacing && pendingAction.ada ? { subjectId: subject.id, ada: pendingAction.ada } : undefined,
                });
            }
        } else if (pendingAction.action === 'link') {
            const link = pendingAction;
            // The route refuses an ΑΔΑ another subject holds, but only after the old decision is gone.
            const holder = link.ada ? Object.values(decisions).find(d => d.ada === link.ada && d.subjectId !== link.subjectId) : undefined;
            if (holder) {
                const holderSubject = subjectById.get(holder.subjectId);
                toast({ title: tPage('linkAdaTaken', { subject: holderSubject ? subjectRef(holderSubject) : '' }), variant: 'destructive' });
                return;
            }
            const cleared = link.replacing ? await handleRemove(link.subjectId, true) : true;
            ok = cleared && await handleSave(link);
            const subject = subjectById.get(link.subjectId);
            if (ok && subject) {
                pushReceipt({ text: tReceipts('linked', { subject: subjectText(subject), number: link.decisionNumber || link.ada || '' }) });
            }
        } else if (pendingAction.action === 'unlink') {
            ok = await handleRemove(pendingAction.subjectId);
        } else if (pendingAction.action === 'dismiss') {
            ok = await handleDismissCandidate(pendingAction.candidateId);
            if (ok) pushReceipt({ text: tReceipts('dismissed', { number: pendingAction.decisionNumber || pendingAction.ada || '' }) });
        } else if (pendingAction.action === 'reassign') {
            const conflict = attention.conflicts.find(c => c.candidate.id === pendingAction.candidateId);
            ok = conflict ? await handleResolveConflict(conflict, 'reassign') : false;
        } else {
            ok = true; // view: nothing to confirm
        }
        if (ok) setPendingAction(null);
    };

    /** Take back a link made in this visit, while the row still holds it. */
    const handleUndo = async (receipt: Receipt) => {
        if (!receipt.undo) return;
        const stillThere = decisions[receipt.undo.subjectId]?.ada === receipt.undo.ada;
        const ok = stillThere ? await handleRemove(receipt.undo.subjectId) : true;
        if (ok) setReceipts(prev => prev.filter(r => r.id !== receipt.id));
    };
    /** A receipt keeps its undo only while its row still holds the document it names. */
    const receiptsShown = receipts.map(receipt =>
        receipt.undo && decisions[receipt.undo.subjectId]?.ada !== receipt.undo.ada ? { ...receipt, undo: undefined } : receipt,
    );

    const scrollToAttention = () =>
        document.getElementById('needs-a-look')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const sheetBusy = candidateBusy !== null || savingSubjectId !== null || removingSubjectId !== null;

    const sourceLabel = (decision: DecisionWithSource): string | null => {
        if (decision.task) return tPage('sourceTask');
        if (decision.createdBy) return tPage('sourceManual', { name: decision.createdBy.name || decision.createdBy.email || '' });
        return null;
    };

    /** The extraction results for a linked subject: excerpt, references, roll call, votes.
     * Shown in the view sheet's second tab. */
    const renderExtractedDetails = (subjectId: string) => {
        const decision = decisions[subjectId];
        const extracted = extractedData[subjectId];
        if (!decision?.excerpt && !decision?.references && !extracted) return null;
        return (
            <div className="space-y-3">
                {decision?.excerpt && (
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                            {tPage('excerpt')}
                        </div>
                        <CollapsibleMarkdown
                            content={decision.excerpt}
                            showMoreLabel={tPage('showMore')}
                            showLessLabel={tPage('showLess')}
                        />
                    </div>
                )}

                {decision?.references && (
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">
                            {tPage('references')}
                        </div>
                        <CollapsibleMarkdown
                            content={decision.references}
                            showMoreLabel={tPage('showMore')}
                            showLessLabel={tPage('showLess')}
                        />
                    </div>
                )}

                {extracted && extracted.attendance.length > 0 && (() => {
                    const filteredAttendance = extracted.attendance.filter(a => a.personId !== mayorPersonId);
                    const present = sortNamesByElectedOrder(
                        filteredAttendance.filter(a => a.status === 'PRESENT'),
                        getPerson, administrativeBodyId,
                    );
                    const absent = sortNamesByElectedOrder(
                        filteredAttendance.filter(a => a.status === 'ABSENT'),
                        getPerson, administrativeBodyId,
                    );
                    return (
                        <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                                {tPage('attendance')}
                            </div>
                            <div className="text-xs text-foreground space-y-1">
                                <span>
                                    {present.length} {tPage('present')}, {absent.length} {tPage('absent')}
                                </span>
                                <div className="flex flex-col gap-1">
                                    {present.length > 0 && (
                                        <NameList
                                            names={present.map(a => a.personName)}
                                            label={`${tPage('showNames')} (${tPage('present')})`}
                                        />
                                    )}
                                    {absent.length > 0 && (
                                        <NameList
                                            names={absent.map(a => a.personName)}
                                            label={`${tPage('showNames')} (${tPage('absent')})`}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {extracted && extracted.votes.length > 0 && (() => {
                    const voteResult = calculateVoteResult(extracted.votes);
                    return (
                        <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                                {tPage('votes')}
                            </div>
                            <div className="text-xs text-foreground space-y-1">
                                <span>
                                    {voteSummaryText(voteResult)}
                                </span>
                                {!voteResult.isUnanimous && (
                                    <div className="flex flex-col gap-1">
                                        <NameList
                                            names={extracted.votes.filter(v => v.voteType === 'FOR').map(v => v.personName)}
                                            label={`${tPage('showNames')} (${voteResult.forCount} ${tPage('voteFor')})`}
                                        />
                                        <NameList
                                            names={extracted.votes.filter(v => v.voteType === 'AGAINST').map(v => v.personName)}
                                            label={`${tPage('showNames')} (${voteResult.againstCount} ${tPage('voteAgainst')})`}
                                        />
                                        {voteResult.abstainCount > 0 && (
                                            <NameList
                                                names={extracted.votes.filter(v => v.voteType === 'ABSTAIN').map(v => v.personName)}
                                                label={`${tPage('showNames')} (${voteResult.abstainCount} ${tPage('voteAbstain')})`}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Re-extraction lives with the data it clears, behind the staff frame. */}
                {isSuperAdmin && (
                    <AdminOnly label={tCommon('adminOnly')}>
                        <div className="flex items-center gap-3">
                            <AdminToolButton destructive onClick={() => handleResetExtraction(subjectId)} disabled={resettingSubjectId === subjectId}>
                                {resettingSubjectId === subjectId && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                {tPage('resetExtraction')}
                            </AdminToolButton>
                            <span className="text-[11px] text-muted-foreground">{tPage('resetExtractionDescription')}</span>
                        </div>
                    </AdminOnly>
                )}
            </div>
        );
    };

    // A city that polling cannot reach hears why, in the place the last check would show.
    const pollingBlocked = !city.diavgeiaUid || pollScope.error !== null;
    const lastCheck = !city.diavgeiaUid
        ? tPage('scope.noOrg')
        : pollScope.error
            ? tPage('scope.malformed', { error: pollScope.error })
            : pollingStatus?.lastPollAt
                ? tPage('status.lastCheck', { when: formatRelativeTime(new Date(pollingStatus.lastPollAt), locale) })
                : tPage('status.lastCheckNever');

    return (
        <div className="container mx-auto max-w-[52rem] space-y-6 py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{tPage('title')}</h1>
                    <p className="max-w-lg text-sm text-muted-foreground">{tPage('description')}</p>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder={tPage('searchSubjects')}
                        className="h-9 w-full pl-9"
                        value={subjectQuery}
                        onChange={e => setSubjectQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                {hasLoaded && (
                    <>
                        <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-600" aria-hidden />
                            {tPage.rich('status.linked', {
                                n: stats.withDecision,
                                total: stats.total,
                                b: chunks => <strong className="font-semibold text-foreground">{chunks}</strong>,
                            })}
                        </span>
                        <span aria-hidden>·</span>
                    </>
                )}
                <span className={pollingBlocked ? 'text-amber-700' : undefined}>{lastCheck}</span>
            </div>

            {!hasLoaded && isLoading ? (
                <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : !hasLoaded && loadFailed ? (
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-foreground/15 bg-card px-5 py-4 text-sm">
                    <span>{tPage('status.loadFailed')}</span>
                    <Button size="sm" variant="outline" onClick={() => { void fetchDecisions(); }}>{tPage('status.retry')}</Button>
                </div>
            ) : (
                <>
                    {/* Refetches keep the children mounted: their fold, picker and radio state survives each answer. */}
                    <AttentionCard
                        attention={attention}
                        estimate={estimate}
                        receipts={receiptsShown}
                        busyCandidateId={candidateBusy}
                        undoingSubjectId={removingSubjectId}
                        unplacedOpen={unplacedOpen}
                        pollingBlocked={pollingBlocked}
                        onToggleUnplaced={() => setUnplacedOpen(o => !o)}
                        onAccept={proposal => setPendingAction({
                            action: 'assign',
                            candidateId: proposal.candidate.id,
                            subjectId: proposal.subject.id,
                            subjectName: proposal.subject.name,
                            replacing: null,
                            ...docOfCandidate(proposal.candidate),
                        })}
                        onReject={proposal => setPendingAction({
                            action: 'dismiss',
                            candidateId: proposal.candidate.id,
                            subjectName: proposal.subject.name,
                            ...docOfCandidate(proposal.candidate),
                        })}
                        onOpenDocument={(candidate, subject) => setPendingAction({
                            action: 'inspect',
                            candidateId: candidate.id,
                            subjectId: subject.id,
                            subjectName: subject.name,
                            ...docOfCandidate(candidate),
                        })}
                        onOpenConflictDocument={conflict => {
                            // A contested document is already linked: read it, never re-pick a subject for it here.
                            const holderDecision = conflict.holder ? decisions[conflict.holder.id] : undefined;
                            setPendingAction(holderDecision && conflict.holder
                                ? { action: 'view', subjectId: conflict.holder.id, subjectName: conflict.holder.name, sourceLabel: sourceLabel(holderDecision), ...docOfDecision(holderDecision) }
                                : { action: 'view', subjectId: null, subjectName: conflict.holderName, sourceLabel: null, ...docOfCandidate(conflict.candidate) });
                        }}
                        onKeepHolder={conflict => { void handleResolveConflict(conflict, 'dismiss'); }}
                        onMoveToClaimant={conflict => conflict.claimant && setPendingAction({
                            action: 'reassign',
                            candidateId: conflict.candidate.id,
                            subjectId: conflict.claimant.id,
                            subjectName: conflict.claimant.name,
                            holderName: conflict.holder?.name ?? conflict.holderName,
                            ...docOfCandidate(conflict.candidate),
                        })}
                        onChooseSubject={item => setPendingAction({
                            action: 'inspect',
                            candidateId: item.candidate.id,
                            subjectId: null,
                            subjectName: null,
                            ...docOfCandidate(item.candidate),
                        })}
                        onDismiss={candidate => setPendingAction({
                            action: 'dismiss',
                            candidateId: candidate.id,
                            subjectName: null,
                            ...docOfCandidate(candidate),
                        })}
                        onUndo={receipt => { void handleUndo(receipt); }}
                        subjectLabel={subjectLabel}
                        subjectRef={subjectRef}
                    />

                    <DecisionsTable
                        subtitle={formatDate(meetingDate, undefined, locale)}
                        sections={[
                            { label: subjectCategories.outOfAgenda.shortLabel, subjects: outOfAgendaSubjects },
                            { label: subjectCategories.agenda.shortLabel, subjects: agendaSubjects },
                        ]}
                        beforeAgendaSubjects={beforeAgendaSubjects}
                        beforeAgendaLabel={subjectCategories.beforeAgenda.shortLabel}
                        decisions={decisions}
                        proposalSubjectIds={proposalSubjectIds}
                        pickableCandidates={pickableCandidates}
                        query={subjectQuery}
                        cityId={meeting.cityId}
                        meetingId={meeting.id}
                        savingSubjectId={savingSubjectId}
                        onView={(subject, decision) => setPendingAction({
                            action: 'view',
                            subjectId: subject.id,
                            subjectName: subject.name,
                            sourceLabel: sourceLabel(decision),
                            ...docOfDecision(decision),
                        })}
                        onAssign={(candidate, subject, replacing) => setPendingAction({
                            action: 'assign',
                            candidateId: candidate.id,
                            subjectId: subject.id,
                            subjectName: subject.name,
                            replacing: replacingOf(replacing),
                            ...docOfCandidate(candidate),
                        })}
                        onManualLink={(subject, entry: ManualEntry, replacing) => setPendingAction({
                            action: 'link',
                            subjectId: subject.id,
                            subjectName: subject.name,
                            replacing: replacingOf(replacing),
                            title: entry.title,
                            decisionNumber: entry.decisionNumber,
                            protocolNumber: entry.protocolNumber,
                            pdfUrl: entry.pdfUrl,
                            ada: entry.ada,
                        })}
                        onUnlink={(subject, decision) => setPendingAction({
                            action: 'unlink',
                            subjectId: subject.id,
                            subjectName: subject.name,
                            destructive: !(decision.candidateBacked ?? false),
                            ...docOfDecision(decision),
                        })}
                        onScrollToAttention={scrollToAttention}
                        subjectRef={subjectRef}
                        linkLabel={linkLabel}
                        withdrawnLabel={subject => getWithdrawnLabel(tSubject, subject)}
                    />

                    {isSuperAdmin && (
                        <AdminTools
                            diavgeiaUid={city.diavgeiaUid}
                            scopes={pollScope.scopes}
                            scopeError={pollScope.error}
                            pollingStatus={pollingStatus}
                            isPolling={isPolling}
                            skipCache={skipCache}
                            onSkipCacheChange={setSkipCache}
                            onPoll={() => { void handlePollDecisions(); }}
                            canClear={extractedSubjects.length > 0}
                            isClearing={isClearing}
                            onClear={() => { void handleClearExtractedData(); }}
                            attendance={meetingAttendance}
                            getPerson={getPerson}
                            administrativeBodyId={administrativeBodyId}
                            mayorPersonId={mayorPersonId}
                        />
                    )}
                </>
            )}

            {/* Confirmation gate for link-changing actions */}
            {sheetAction && (
                <ConfirmSheet
                    open={pendingAction !== null}
                    onOpenChange={(o) => { if (!o && !sheetBusy) setPendingAction(null); }}
                    action={sheetAction.action}
                    destructive={sheetAction.action === 'unlink' && sheetAction.destructive}
                    decisionTitle={sheetAction.title}
                    decisionNumber={sheetAction.decisionNumber}
                    subjectName={sheetAction.subjectName}
                    holderName={sheetAction.action === 'reassign' ? sheetAction.holderName : null}
                    pdfUrl={sheetAction.pdfUrl}
                    ada={sheetAction.ada}
                    sourceLabel={sheetAction.action === 'view' ? sheetAction.sourceLabel : null}
                    subjectDescription={'subjectId' in sheetAction && sheetAction.subjectId
                        ? subjects.find(s => s.id === sheetAction.subjectId)?.description ?? null
                        : null}
                    agendaItemTitle={'subjectId' in sheetAction && sheetAction.subjectId
                        ? subjects.find(s => s.id === sheetAction.subjectId)?.agendaItemTitle ?? null
                        : null}
                    busy={sheetBusy}
                    extraContent={sheetAction.action === 'view' && sheetAction.subjectId ? renderExtractedDetails(sheetAction.subjectId) : undefined}
                    onConfirm={confirmPending}
                    confirmDisabled={sheetAction.action === 'inspect' && sheetAction.subjectId === null}
                    confirmLabel={(() => {
                        if (sheetAction.action === 'assign' || sheetAction.action === 'link' || sheetAction.action === 'inspect' || sheetAction.action === 'reassign') {
                            const subject = sheetAction.subjectId ? subjectById.get(sheetAction.subjectId) : undefined;
                            return subject ? linkLabel(subject) : undefined;
                        }
                        return undefined;
                    })()}
                    note={(sheetAction.action === 'assign' || sheetAction.action === 'link') && sheetAction.replacing
                        ? tSheet(sheetAction.replacing.destructive ? 'replaceNoteDestructive' : 'replaceNote', { number: sheetAction.replacing.decisionNumber })
                        : null}
                    noteDestructive={(sheetAction.action === 'assign' || sheetAction.action === 'link') && (sheetAction.replacing?.destructive ?? false)}
                    subjectOptions={sheetAction.action === 'inspect' ? subjectOptions : undefined}
                    selectedSubjectId={sheetAction.action === 'inspect' ? sheetAction.subjectId : null}
                    onSelectSubject={sheetAction.action === 'inspect' ? (id) => {
                        const subject = subjectById.get(id);
                        setPendingAction(prev => prev?.action === 'inspect' ? { ...prev, subjectId: id, subjectName: subject?.name ?? null } : prev);
                    } : undefined}
                    onDismiss={sheetAction.action === 'inspect' ? async () => {
                        const ok = await handleDismissCandidate(sheetAction.candidateId);
                        if (ok) {
                            pushReceipt({ text: tReceipts('dismissed', { number: sheetAction.decisionNumber || sheetAction.ada || '' }) });
                            setPendingAction(null);
                        }
                    } : undefined}
                    dismissLabel={sheetAction.action === 'inspect' ? tAttention('notThisMeeting') : undefined}
                />
            )}
        </div>
    );
}
