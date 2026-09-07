"use client"

import { useState, useEffect, useCallback, useRef, Fragment, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { useTranslations } from 'next-intl';
import { FileText, Loader2, Bot, UserIcon, Plus, X, Clock, ChevronRight, ChevronDown, Users, Vote, Search, MoreHorizontal, RotateCcw } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DecisionWithSource, MeetingAttendanceRecord, SubjectExtractedData } from '@/lib/db/decisions';
import { MeetingCandidate } from '@/lib/db/decisionCandidateShape';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LinkOrDrop } from '@/components/ui/link-or-drop';
import { BadgePicker } from '@/components/ui/badge-picker';
import { getPollingHistoryForMeeting, requestPollDecisions } from '@/lib/tasks/pollDecisions';
import { calculateVoteResult } from '@/lib/utils/votes';
import { formatDate } from '@/lib/formatters/time';
import { getWithdrawnLabel } from '@/lib/utils/subjects';
import { isMayorRole, isRoleActiveAt } from '@/lib/utils/roles';
import { CollapsibleMarkdown, NameList, MeetingAttendanceSummary, sortNamesByElectedOrder } from '@/components/meetings/decisions/shared';
import { computeDecisionStats } from '@/components/meetings/decisions/stats';
import { normalizeText } from '@/lib/utils';
import { diavgeiaDocUrl, diavgeiaSearchUrl } from '@/components/meetings/decisions/pdfUrl';
import { parseDiavgeiaUnitScopes } from '@/lib/utils/diavgeiaUnitScope';
import { ConfirmSheet } from '@/components/meetings/decisions/ConfirmSheet';

interface ManualEntryState {
    pdfUrl: string;
    ada: string;
    decisionNumber: string;
    protocolNumber: string;
    title: string;
}

interface FormErrors {
    ada?: string;
    pdfUrl?: string;
}

/** MeetingCandidate as it arrives over JSON — dates serialized to strings. */
type CandidateView = Omit<MeetingCandidate, 'publishDate' | 'meetingDate'> & {
    publishDate: string | null;
    meetingDate: string | null;
};

type SubjectStatus = 'linked' | 'none';

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

/** A link-changing action awaiting confirmation in the sheet. */
type PendingAction =
    | { action: 'assign'; candidateId: string; subjectId: string; subjectName: string; title: string | null; decisionNumber: string | null; pdfUrl: string; ada: string | null }
    | { action: 'link'; subjectId: string; subjectName: string; title: string | null; decisionNumber: string | null; protocolNumber: string | null; pdfUrl: string; ada: string | null }
    | { action: 'unlink'; subjectId: string; subjectName: string; title: string | null; decisionNumber: string | null; pdfUrl: string; ada: string | null; destructive: boolean }
    | { action: 'dismiss'; candidateId: string; subjectName: string | null; title: string | null; decisionNumber: string | null; pdfUrl: string; ada: string | null }
    | { action: 'inspect'; candidateId: string; subjectId: string | null; subjectName: string | null; title: string | null; decisionNumber: string | null; pdfUrl: string; ada: string | null }
    | { action: 'view'; subjectId: string; subjectName: string; title: string | null; decisionNumber: string | null; pdfUrl: string; ada: string | null };

export function MeetingDecisionsPage({ isSuperAdmin }: { isSuperAdmin: boolean }) {
    const { toast } = useToast();
    const { subjects, meeting, city, people, getPerson } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const tPage = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');
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
    const [expandedManualEntry, setExpandedManualEntry] = useState<string | null>(null);
    const [editState, setEditState] = useState<ManualEntryState>({ pdfUrl: '', ada: '', decisionNumber: '', protocolNumber: '', title: '' });
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [savingSubjectId, setSavingSubjectId] = useState<string | null>(null);
    const [removingSubjectId, setRemovingSubjectId] = useState<string | null>(null);
    const [resettingSubjectId, setResettingSubjectId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [pollingStatus, setPollingStatus] = useState<Awaited<ReturnType<typeof getPollingHistoryForMeeting>> | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [skipCache, setSkipCache] = useState(false);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [trayOpen, setTrayOpen] = useState(false);
    // Empty selection means no status filter (BadgePicker's "all" state).
    const [statusFilter, setStatusFilter] = useState<SubjectStatus[]>([]);
    const [subjectQuery, setSubjectQuery] = useState('');
    // The sheet stays mounted while it animates out — same dismissable-layer
    // bug as the modal={false} note on the row menu below.
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
                toast({ title: t('toasts.errorSavingDecision.title'), description: `HTTP ${response.status}`, variant: 'destructive' });
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
        } catch {
            // silent
        } finally {
            setIsLoading(false);
        }
    }, [meeting.cityId, meeting.id]);

    useEffect(() => {
        fetchDecisions();
        getPollingHistoryForMeeting(meeting.cityId, meeting.id)
            .then(setPollingStatus)
            .catch(() => { /* silent */ });
    }, [fetchDecisions, meeting.cityId, meeting.id]);

    const validateForm = (): boolean => {
        const errors: FormErrors = {};

        if (!showMoreOptions) {
            // ADA-only mode: ADA is required, pdfUrl is auto-derived
            if (!editState.ada.trim()) {
                errors.ada = tPage('validation.adaRequired');
            }
        } else {
            // More options mode: need ADA or a manual pdfUrl
            if (!editState.ada.trim() && !editState.pdfUrl.trim()) {
                errors.ada = tPage('validation.adaRequired');
            }
            if (editState.pdfUrl.trim() && !editState.pdfUrl.startsWith('http://') && !editState.pdfUrl.startsWith('https://')) {
                errors.pdfUrl = tPage('validation.pdfUrlInvalid');
            }
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    /** The one-line vote outcome sentence, shared by the row summary and the sheet. */
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

    /** The manual-entry values that actually apply: fields hidden behind a
     * collapsed "more options" section must not leak into the save. */
    const effectiveEntry = () => {
        const ada = editState.ada.trim();
        const extras = showMoreOptions
            ? {
                pdfUrl: editState.pdfUrl.trim(),
                title: editState.title.trim(),
                decisionNumber: editState.decisionNumber.trim(),
                protocolNumber: editState.protocolNumber.trim(),
            }
            : { pdfUrl: '', title: '', decisionNumber: '', protocolNumber: '' };
        return { ada, ...extras, effectivePdfUrl: extras.pdfUrl || diavgeiaDocUrl(ada) };
    };

    /** Validate the manual-entry form and stage the link for sheet confirmation. */
    const openLinkSheet = (subjectId: string, subjectName: string) => {
        if (!validateForm()) return;
        const entry = effectiveEntry();
        setPendingAction({
            action: 'link',
            subjectId,
            subjectName,
            title: entry.title || entry.ada || null,
            decisionNumber: entry.decisionNumber || null,
            protocolNumber: entry.protocolNumber || null,
            pdfUrl: entry.effectivePdfUrl,
            ada: entry.ada || null,
        });
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
            setExpandedManualEntry(null);
            setEditState({ pdfUrl: '', ada: '', decisionNumber: '', protocolNumber: '', title: '' });
            toast({ title: t('toasts.decisionLinked.title') });

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

    const handleRemove = async (subjectId: string) => {
        setRemovingSubjectId(subjectId);
        try {
            const response = await fetch(
                `/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions?subjectId=${subjectId}`,
                { method: 'DELETE' }
            );
            if (!response.ok) throw new Error('Failed to remove decision');
            toast({ title: tPage('decisionRemoved') });
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
            toast({ title: tPage('unplacedAssigned') });
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
            toast({ title: tPage('unplacedDismissed') });
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

    const toggleManualEntry = (subjectId: string) => {
        if (expandedManualEntry === subjectId) {
            setExpandedManualEntry(null);
        } else {
            setExpandedManualEntry(subjectId);
        }
        setEditState({ pdfUrl: '', ada: '', decisionNumber: '', protocolNumber: '', title: '' });
        setFormErrors({});
        setShowMoreOptions(false);
    };

    const updateEditState = (field: keyof ManualEntryState, value: string) => {
        setEditState(prev => ({ ...prev, [field]: value }));
        // Clear error for this field when user starts typing
        if (field === 'pdfUrl' && formErrors.pdfUrl) {
            setFormErrors(prev => ({ ...prev, pdfUrl: undefined }));
        }
        if (field === 'ada' && formErrors.ada) {
            setFormErrors(prev => ({ ...prev, ada: undefined }));
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

    // Subjects eligible for decisions: agenda items + outOfAgenda, in display order.
    // Use nonAgendaReason as the primary discriminator — agendaItemIndex alone is not
    // sufficient because outOfAgenda subjects may also have an agendaItemIndex from PDF data.
    // beforeAgenda subjects are excluded (pre-agenda announcements without decisions).
    const agendaSubjects = subjects
        .filter(s => s.agendaItemIndex != null && s.nonAgendaReason === null)
        .sort((a, b) => a.agendaItemIndex! - b.agendaItemIndex!);
    const outOfAgendaSubjects = subjects
        .filter(s => s.nonAgendaReason === 'outOfAgenda');
    const allDisplaySubjects = [...agendaSubjects, ...outOfAgendaSubjects];
    const eligibleSubjects = allDisplaySubjects.filter(s => !s.withdrawn);
    const extractedSubjects = eligibleSubjects.filter(s => {
        const decision = decisions[s.id];
        return (decision?.excerpt) || extractedData[s.id];
    });

    // Urgency-first sections: subjects still without a decision (withdrawn ones

    // Subject-centric inversion: an unplaced candidate either proposes itself on
    // its suggested subject's row, or waits in the tray below the list. A
    // conflict annotates the subject that holds the ADA.
    const proposalBySubject = new Map<string, CandidateView>();
    const trayCandidates: CandidateView[] = [];
    for (const c of candidates) {
        const suggested = c.subjectId && !c.conflict ? allDisplaySubjects.find(s => s.id === c.subjectId) : null;
        if (suggested && !suggested.withdrawn && !decisions[suggested.id] && !proposalBySubject.has(suggested.id)) {
            proposalBySubject.set(suggested.id, c);
        } else {
            trayCandidates.push(c);
        }
    }
    const conflictsByHolder = new Map<string, CandidateView>();
    for (const c of candidates) {
        if (c.conflict && !conflictsByHolder.has(c.conflict.subjectId)) {
            conflictsByHolder.set(c.conflict.subjectId, c);
        }
    }
    const pickableCandidates = candidates.filter(c => !c.conflict);

    const subjectStatus = (subjectId: string): SubjectStatus =>
        decisions[subjectId] ? 'linked' : 'none';
    const query = normalizeText(subjectQuery.trim());
    const matchesQuery = (subjectId: string, name: string): boolean => {
        if (!query) return true;
        if (normalizeText(name).includes(query)) return true;
        const d = decisions[subjectId];
        return !!d && [d.title, d.ada, d.decisionNumber, d.protocolNumber]
            .some(v => v && normalizeText(v).includes(query));
    };
    const filteredSubjects = allDisplaySubjects.filter(s =>
        (statusFilter.length === 0 || statusFilter.includes(subjectStatus(s.id))) && matchesQuery(s.id, s.name));
    const stats = computeDecisionStats(eligibleSubjects.map(s => s.id), decisions, candidates);

    /** Run the sheet-confirmed action; close the sheet only when it succeeds,
     * so a failure keeps the document context for the retry. */
    const confirmPending = async () => {
        if (!pendingAction) return;
        let ok: boolean;
        if (pendingAction.action === 'assign') {
            ok = await handleAssignCandidate(pendingAction.candidateId, pendingAction.subjectId);
        } else if (pendingAction.action === 'link') {
            ok = await handleSave(pendingAction);
        } else if (pendingAction.action === 'dismiss') {
            ok = await handleDismissCandidate(pendingAction.candidateId);
        } else if (pendingAction.action === 'view') {
            ok = true; // read-only: the sheet has no confirm button
        } else if (pendingAction.action === 'inspect') {
            // The confirm button assigns; it is disabled without a selected subject.
            ok = pendingAction.subjectId !== null
                && await handleAssignCandidate(pendingAction.candidateId, pendingAction.subjectId);
        } else {
            ok = await handleRemove(pendingAction.subjectId);
        }
        if (ok) setPendingAction(null);
    };

    const sheetBusy = candidateBusy !== null || savingSubjectId !== null || removingSubjectId !== null;


    // Helper to get source info for a decision
    const getSourceInfo = (decision: DecisionWithSource) => {
        if (decision.task) {
            return { type: 'task' as const, label: tPage('sourceTask') };
        } else if (decision.createdBy) {
            return { type: 'user' as const, label: tPage('sourceManual', { name: decision.createdBy.name || decision.createdBy.email || '' }) };
        }
        return null;
    };

    /** The extraction results for a linked subject: excerpt, references, roll call, votes.
     * Shown in the view sheet's second tab (the old in-row accordion). */
    const renderExtractedDetails = (subjectId: string) => {
        const decision = decisions[subjectId];
        const extracted = extractedData[subjectId];
        if (!decision?.excerpt && !decision?.references && !extracted) return null;
        return (
            <div className="space-y-3">
                        {/* Excerpt */}
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

                        {/* References */}
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

                        {/* Attendance */}
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

                        {/* Votes */}
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
            </div>
        );
    };

    const renderSubjectRow = (subject: (typeof subjects)[number], index: number, sectionSubjects: typeof subjects) => {
        const decision = decisions[subject.id];
        const extracted = extractedData[subject.id];
        const sourceInfo = decision ? getSourceInfo(decision) : null;
        const isManualExpanded = expandedManualEntry === subject.id;
        const isSaving = savingSubjectId === subject.id;
        const isRemoving = removingSubjectId === subject.id;

        const showOutOfAgendaSeparator = subject.nonAgendaReason === 'outOfAgenda' &&
            (index === 0 || sectionSubjects[index - 1].nonAgendaReason !== 'outOfAgenda');

        return (
            <Fragment key={subject.id}>
                {showOutOfAgendaSeparator && (
                    <div className="pt-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {tSubject('categories.outOfAgenda.shortLabel')}
                    </div>
                )}
            <div
                id={`subject-row-${subject.id}`}
                className="py-3 border-b last:border-b-0"
            >
                {/* Main row */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 flex items-start gap-2">
                        <span
                            className={`mt-[7px] h-2 w-2 rounded-full shrink-0 ${decision ? 'bg-green-600' : proposalBySubject.has(subject.id) ? 'bg-amber-500' : 'border-[1.5px] border-gray-300 bg-transparent'}`}
                            title={decision ? undefined : tPage('noDecision')}
                        />
                        <div className="min-w-0">
                            {decision ? (
                                <button
                                    type="button"
                                    className={`font-medium text-sm break-words text-left hover:underline ${subject.withdrawn ? 'text-muted-foreground' : 'text-gray-900'}`}
                                    onClick={() => setPendingAction({
                                        action: 'view',
                                        subjectId: subject.id,
                                        subjectName: subject.name,
                                        ...docOfDecision(decision),
                                    })}
                                >
                                    {subject.agendaItemIndex != null && (
                                        <span className="text-muted-foreground mr-1">#{subject.agendaItemIndex}</span>
                                    )}
                                    {subject.name}
                                </button>
                            ) : (
                            <div className={`font-medium text-sm break-words ${subject.withdrawn ? 'text-muted-foreground' : 'text-gray-900'}`}>
                                {subject.agendaItemIndex != null && (
                                    <span className="text-muted-foreground mr-1">#{subject.agendaItemIndex}</span>
                                )}
                                {subject.name}
                            </div>
                            )}
                            {conflictsByHolder.has(subject.id) && (() => {
                                const cc = conflictsByHolder.get(subject.id)!;
                                return (
                                    <button
                                        type="button"
                                        onClick={() => setPendingAction({
                                            action: 'inspect',
                                            candidateId: cc.id,
                                            subjectId: null,
                                            subjectName: null,
                                            ...docOfCandidate(cc),
                                        })}
                                        className="block text-left text-xs text-destructive mt-1 hover:underline"
                                    >
                                        ⚠ {tPage('conflictOnRow')} — {tPage('reviewAction')}
                                    </button>
                                );
                            })()}
                            {/* Subtitle: the decision's title on linked rows; the subject's own
                                description on gaps — the context that decides a match. */}
                            {decision?.title ? (
                                <div className="text-xs text-muted-foreground mt-0.5 break-words">
                                    {decision.title}
                                </div>
                            ) : !decision && subject.description ? (
                                <div className="text-xs text-muted-foreground mt-0.5 break-words line-clamp-2">
                                    {subject.description}
                                </div>
                            ) : null}
                            {/* Inline attendance & vote summary */}
                            {extracted && (extracted.attendance.length > 0 || extracted.votes.length > 0) && (() => {
                                const filteredInline = extracted.attendance.filter(a => a.personId !== mayorPersonId);
                                const present = filteredInline.filter(a => a.status === 'PRESENT');
                                const absent = filteredInline.filter(a => a.status === 'ABSENT');
                                const voteResult = extracted.votes.length > 0 ? calculateVoteResult(extracted.votes) : null;
                                return (
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                        {extracted.attendance.length > 0 && (
                                            <span className="inline-flex items-center gap-1">
                                                <Users className="h-3 w-3" />
                                                {present.length}/{absent.length}
                                            </span>
                                        )}
                                        {voteResult && (
                                            <span className="inline-flex items-center gap-1">
                                                <Vote className="h-3 w-3" />
                                                {voteSummaryText(voteResult)}
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {subject.withdrawn ? (
                            <Badge variant="secondary" className="text-xs text-muted-foreground italic">
                                {getWithdrawnLabel(tSubject, subject)}
                            </Badge>
                        ) : decision ? (
                            <>
                                {sourceInfo && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="text-muted-foreground">
                                                {sourceInfo.type === 'task' ? (
                                                    <Bot className="h-4 w-4" />
                                                ) : (
                                                    <UserIcon className="h-4 w-4" />
                                                )}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {sourceInfo.label}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {/* Fixed columns keep the badge, the ADA, and the menu vertically
                                    aligned across rows; empty spans hold the grid when a value is
                                    missing. The ADA column is monospace — ADAs share one length, so
                                    they self-align. */}
                                <span className="flex w-28 justify-end">
                                    <Badge variant="default" className="bg-green-600 text-xs">
                                        <FileText className="h-3 w-3 mr-1" />
                                        {/* The decision's own number; Diavgeia's protocolNumber is a
                                            filing protocol in some municipalities, so it is only a
                                            fallback until decisionNumber is backfilled. */}
                                        {decision.decisionNumber || decision.protocolNumber || tPage('linked')}
                                    </Badge>
                                </span>
                                <span className="w-[88px] font-mono text-xs text-muted-foreground">
                                    {decision.ada ?? ''}
                                </span>
                                {/* modal would set body{pointer-events:none}; with the duplicated
                                    @radix-ui/react-dismissable-layer copies in the lockfile, the sheet
                                    opened from a menu item then restores that value on close and
                                    freezes the page. Non-modal never touches body styles. */}
                                <DropdownMenu modal={false}>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            disabled={isRemoving || resettingSubjectId === subject.id}
                                            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                                        >
                                            {(isRemoving || resettingSubjectId === subject.id) ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <MoreHorizontal className="h-4 w-4" />
                                            )}
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-72">
                                        {isSuperAdmin && (<>
                                        <DropdownMenuItem
                                            onClick={() => handleResetExtraction(subject.id)}
                                            disabled={resettingSubjectId === subject.id}
                                        >
                                            <div>
                                                <div className="text-sm font-medium">{tPage('resetExtraction')}</div>
                                                <div className="text-xs text-muted-foreground mt-0.5">{tPage('resetExtractionDescription')}</div>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        </>)}
                                        <DropdownMenuItem
                                            onClick={() => setPendingAction({
                                                action: 'unlink',
                                                subjectId: subject.id,
                                                subjectName: subject.name,
                                                ...docOfDecision(decision),
                                                destructive: !(decision.candidateBacked ?? false),
                                            })}
                                            disabled={isRemoving}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <div>
                                                <div className="text-sm font-medium">{tPage('removeDecision')}</div>
                                                <div className="text-xs text-muted-foreground mt-0.5">{tPage('removeDecisionDescription')}</div>
                                            </div>
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        ) : (
                            <>
                                {!proposalBySubject.has(subject.id) && pickableCandidates.length > 0 && (
                                    <Select value="" onValueChange={(cid) => {
                                        const c = candidates.find(x => x.id === cid);
                                        if (c) setPendingAction({
                                            action: 'assign',
                                            candidateId: c.id,
                                            subjectId: subject.id,
                                            subjectName: subject.name,
                                            ...docOfCandidate(c),
                                        });
                                    }}>
                                        <SelectTrigger className="h-8 w-52 text-xs">
                                            <SelectValue placeholder={tPage('pickDecision')} />
                                        </SelectTrigger>
                                        {/* Real titles are paragraph-long legal sentences: cap the
                                            panel's width and let titles wrap — the tail is often the
                                            only thing distinguishing near-identical decisions. */}
                                        <SelectContent className="max-w-[min(36rem,90vw)]">
                                            {pickableCandidates.map(c => {
                                                const elsewhere = c.subjectId && c.subjectId !== subject.id
                                                    ? subjects.find(s => s.id === c.subjectId)?.agendaItemIndex
                                                    : null;
                                                return (
                                                    <SelectItem key={c.id} value={c.id} className="text-xs">
                                                        <span className="block max-w-[32rem] whitespace-normal">
                                                            <span className="font-semibold">{c.decisionNumber || c.ada}</span>
                                                            {c.title ? ` — ${c.title}` : ''}
                                                            {elsewhere != null ? ` ${tPage('suggestedElsewhere', { n: elsewhere })}` : ''}
                                                        </span>
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                )}
                                <button
                                    onClick={() => toggleManualEntry(subject.id)}
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                >
                                    {isManualExpanded ? (
                                        <X className="h-3 w-3" />
                                    ) : (
                                        <Plus className="h-3 w-3" />
                                    )}
                                    {tPage('addManually')}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Proposed decision from the resolver: assign or dismiss in place */}
                {!decision && !isManualExpanded && (() => {
                    const proposal = proposalBySubject.get(subject.id);
                    if (!proposal) return null;
                    const busyC = candidateBusy === proposal.id;
                    return (
                        <div className="mt-2 ml-6 flex items-center gap-2.5 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-[13px]">
                            <span className="shrink-0 font-medium text-amber-800 dark:text-amber-300">{tPage('proposalLabel')}</span>
                            <button
                                type="button"
                                className="truncate text-left font-semibold hover:underline"
                                onClick={() => setPendingAction({
                                    action: 'inspect',
                                    candidateId: proposal.id,
                                    subjectId: subject.id,
                                    subjectName: subject.name,
                                    ...docOfCandidate(proposal),
                                })}
                            >
                                {proposal.title ?? proposal.ada}
                            </button>
                            {proposal.decisionNumber && <span className="shrink-0 text-xs text-muted-foreground">{proposal.decisionNumber}</span>}
                            {proposal.confidence != null && (
                                <span className="flex shrink-0 items-center gap-1.5">
                                    <span className="flex gap-0.5">
                                        {[0, 1, 2, 3].map(i => (
                                            <span key={i} className={`h-1.5 w-3.5 rounded-full ${i < Math.floor(proposal.confidence! * 4) ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                        ))}
                                    </span>
                                    <span className="text-[11px] font-semibold text-green-600">{Math.round(proposal.confidence * 100)}%</span>
                                </span>
                            )}
                            <span className="ml-auto flex shrink-0 items-center gap-2">
                                <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={busyC}
                                    onClick={() => setPendingAction({
                                        action: 'assign',
                                        candidateId: proposal.id,
                                        subjectId: subject.id,
                                        subjectName: subject.name,
                                        ...docOfCandidate(proposal),
                                    })}
                                >
                                    {busyC ? <Loader2 className="h-3 w-3 animate-spin" /> : tPage('unplacedAssign')}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    disabled={busyC}
                                    onClick={() => setPendingAction({
                                        action: 'dismiss',
                                        candidateId: proposal.id,
                                        subjectName: null,
                                        ...docOfCandidate(proposal),
                                    })}
                                >
                                    {tPage('unplacedDismiss')}
                                </Button>
                            </span>
                        </div>
                    );
                })()}

                {/* Manual entry form - expandable */}
                {isManualExpanded && (
                    <div className="mt-3 pl-4 border-l-2 border-muted space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{tPage('adaLabel')} *</Label>
                            <Input
                                placeholder={tPage('adaPlaceholder')}
                                value={editState.ada}
                                onChange={e => updateEditState('ada', e.target.value)}
                                className={`text-sm h-8 ${formErrors.ada ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                            />
                            {formErrors.ada && (
                                <p className="text-xs text-destructive">{formErrors.ada}</p>
                            )}
                            {!showMoreOptions && editState.ada.trim() && (
                                <p className="text-xs text-muted-foreground">
                                    {tPage('autoPdfHint', { ada: editState.ada.trim() })}
                                </p>
                            )}
                        </div>

                        <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowMoreOptions(prev => !prev)}
                        >
                            {showMoreOptions ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {tPage('moreOptions')}
                        </button>

                        {showMoreOptions && (
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{tPage('pdfUrlLabel')}</Label>
                                    <LinkOrDrop
                                        placeholder={tPage('pdfUrlPlaceholder')}
                                        value={editState.pdfUrl}
                                        onChange={e => updateEditState('pdfUrl', e.target.value)}
                                        onUrlChange={url => updateEditState('pdfUrl', url)}
                                        config={{
                                            cityId: meeting.cityId,
                                            identifier: `${meeting.id}_${subject.id}`,
                                            suffix: 'decision',
                                        }}
                                        inputClassName={`text-sm h-8 ${formErrors.pdfUrl ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                                    />
                                    {formErrors.pdfUrl && (
                                        <p className="text-xs text-destructive">{formErrors.pdfUrl}</p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">{tPage('titleLabel')}</Label>
                                    <Input
                                        placeholder={tPage('titlePlaceholder')}
                                        value={editState.title}
                                        onChange={e => updateEditState('title', e.target.value)}
                                        className="text-sm h-8"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">{tPage('decisionNumberLabel')}</Label>
                                        <Input
                                            placeholder={tPage('decisionNumberPlaceholder')}
                                            value={editState.decisionNumber}
                                            onChange={e => updateEditState('decisionNumber', e.target.value)}
                                            className="text-sm h-8"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">{tPage('protocolNumberLabel')}</Label>
                                        <Input
                                            placeholder={tPage('protocolNumberExample')}
                                            value={editState.protocolNumber}
                                            onChange={e => updateEditState('protocolNumber', e.target.value)}
                                            className="text-sm h-8"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Button
                                size="sm"
                                className="h-8"
                                disabled={isSaving}
                                onClick={() => openLinkSheet(subject.id, subject.name)}
                            >
                                {isSaving ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : null}
                                {tPage('save')}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
            </Fragment>
        );
    };

    return (
        <div className="container mx-auto max-w-5xl py-6 space-y-6">
            {/* Header */}
            <div className="space-y-3 border-b pb-4">
                <div>
                    <h1 className="text-xl font-semibold">{tPage('title')}</h1>
                    <p className="text-sm text-muted-foreground">{tPage('description')}</p>
                    <p className="text-sm text-muted-foreground mt-1.5">
                        <b className="text-base font-bold text-green-600">{stats.withDecision}/{stats.total}</b> {tPage('statsLinked', { n: stats.withDecision })}
                        <span className="mx-2 text-gray-300">|</span>
                        <b className="text-base font-bold text-amber-700">{proposalBySubject.size}</b> {tPage('statsProposed', { n: proposalBySubject.size })}
                        <span className="mx-2 text-gray-300">|</span>
                        <button
                            type="button"
                            className="hover:underline disabled:no-underline"
                            disabled={trayCandidates.length === 0}
                            onClick={() => {
                                setTrayOpen(true);
                                requestAnimationFrame(() => document.getElementById('unplaced-tray')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                            }}
                        >
                            <b className="text-base font-bold text-amber-700">{trayCandidates.length}</b> {tPage('statsTray', { n: trayCandidates.length })}
                        </button>
                        <span className="mx-2 text-gray-300">|</span>
                        <b className="text-base font-bold text-red-700">{stats.conflicts}</b> {tPage('statsConflicts', { n: stats.conflicts })}
                    </p>
                </div>

                {/* Poll actions — cost-incurring operations, superadmin only */}
                {isSuperAdmin && (<>
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs font-medium">
                            {tPage('pollTitle')}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <Checkbox
                                id="skip-cache"
                                checked={skipCache}
                                onCheckedChange={(checked) => setSkipCache(checked === true)}
                                className="h-3.5 w-3.5"
                            />
                            <span className="text-[11px] text-muted-foreground">
                                {tPage('skipCacheLabel')}
                            </span>
                        </label>
                        <Button
                            variant="outline"
                            size="sm"
                            className={`h-7 text-xs ${skipCache ? 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100' : ''}`}
                            disabled={isPolling}
                            onClick={handlePollDecisions}
                        >
                            {isPolling ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                                <Search className="h-3 w-3 mr-1" />
                            )}
                            {skipCache ? tPage('pollButtonSkipCache') : tPage('pollButton')}
                        </Button>
                    </div>
                </div>

                {/* Skip cache explanation — shown when toggled */}
                {skipCache && (
                    <div className="text-[11px] text-muted-foreground bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                        {tPage('skipCacheHint')}
                    </div>
                )}
                </>)}

                {/* Polling status, visible to city admins: what Diavgeia scope the poll
                    queries (each id opens the portal search), then the history. */}
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <Clock className="h-3 w-3" />
                    {!city.diavgeiaUid ? (
                        <span className="text-amber-700">{tPage('scope.noOrg')}</span>
                    ) : pollScope.error ? (
                        <span className="text-red-700">{tPage('scope.malformed', { error: pollScope.error })}</span>
                    ) : (
                        <>
                            <a href={diavgeiaSearchUrl(city.diavgeiaUid)} target="_blank" rel="noopener noreferrer" className="font-mono hover:underline">
                                {tPage('scope.org', { org: city.diavgeiaUid })}
                            </a>
                            {pollScope.scopes.length === 0 ? (
                                <>
                                    <span>&middot;</span>
                                    <span className="text-amber-700">{tPage('scope.orgWide')}</span>
                                </>
                            ) : pollScope.scopes.map(scope => (
                                <span key={`${scope.unit}:${scope.signer ?? ''}`} className="flex items-center gap-1.5">
                                    <span>&middot;</span>
                                    <a href={diavgeiaSearchUrl(city.diavgeiaUid!, scope)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                        {scope.signer
                                            ? tPage('scope.unitSigner', { unit: scope.unit, signer: scope.signer })
                                            : tPage('scope.unit', { unit: scope.unit })}
                                    </a>
                                </span>
                            ))}
                        </>
                    )}
                    {pollingStatus && pollingStatus.totalPolls > 0 && (
                        <>
                            <span>&middot;</span>
                            <span>{tPage('polling.polled', { n: pollingStatus.totalPolls })}</span>
                            {pollingStatus.firstPollAt && (
                                <>
                                    <span>&middot;</span>
                                    <span>{tPage('polling.started', { date: formatDate(new Date(pollingStatus.firstPollAt)) })}</span>
                                </>
                            )}
                            {pollingStatus.currentTier?.kind === 'everyRun' && (
                                <>
                                    <span>&middot;</span>
                                    <span>{tPage('polling.tier.everyRun')}</span>
                                </>
                            )}
                            {pollingStatus.currentTier?.kind === 'interval' && (
                                <>
                                    <span>&middot;</span>
                                    <span>{tPage('polling.tier.interval', { days: pollingStatus.currentTier.intervalDays })}</span>
                                </>
                            )}
                            {pollingStatus.nextPollEligible ? (
                                <>
                                    <span>&middot;</span>
                                    <span>{tPage('polling.next', { date: formatDate(new Date(pollingStatus.nextPollEligible)) })}</span>
                                </>
                            ) : pollingStatus.currentTier?.kind === 'stopped' ? (
                                <>
                                    <span>&middot;</span>
                                    <span>{tPage('polling.stopped')}</span>
                                </>
                            ) : null}
                        </>
                    )}
                </div>
            </div>

            {/* Meeting-level attendance (initial roll call) — superadmin-only while
                extraction quality is still being validated */}
            {isSuperAdmin && meetingAttendance.length > 0 && (
                <MeetingAttendanceSummary
                    attendance={meetingAttendance}
                    getPerson={getPerson}
                    administrativeBodyId={administrativeBodyId}
                    mayorPersonId={mayorPersonId}
                />
            )}

            {isLoading ? (
                <div className="p-8 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <TooltipProvider>
                    <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center">
                        <BadgePicker
                            options={[
                                { value: 'linked' as const, label: tPage('filterLinked') },
                                { value: 'none' as const, label: tPage('filterNone') },
                            ]}
                            selectedValues={statusFilter}
                            onSelectionChange={(values) => setStatusFilter(values)}
                            allLabel={tPage('filterAll')}
                            collapsible={false}
                            inline
                        />
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-500" />
                            <Input
                                placeholder={tPage('searchSubjects')}
                                className="h-9 w-full pl-10"
                                value={subjectQuery}
                                onChange={e => setSubjectQuery(e.target.value)}
                            />
                        </div>
                    </div>

                    {filteredSubjects.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">{tPage('filterEmpty')}</div>
                    ) : (
                        <div className="space-y-1">
                            {filteredSubjects.map((subject, index, arr) => renderSubjectRow(subject, index, arr))}
                        </div>
                    )}

                    {/* Documents no subject claims: inspect or dismiss */}
                    {trayCandidates.length > 0 && (
                        <div id="unplaced-tray" className="mt-4 border-t border-dashed pt-3">
                            <button
                                type="button"
                                onClick={() => setTrayOpen(o => !o)}
                                className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                            >
                                {trayOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                {tPage('trayTitle')} ({trayCandidates.length})
                            </button>
                            {trayOpen && (
                                <div className="mt-2 space-y-1.5">
                                    {trayCandidates.map(c => (
                                        <div key={c.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-[13px]">
                                            <button
                                                type="button"
                                                className="truncate text-left font-medium hover:underline"
                                                onClick={() => setPendingAction({
                                                    action: 'inspect',
                                                    candidateId: c.id,
                                                    subjectId: null,
                                                    subjectName: null,
                                                    ...docOfCandidate(c),
                                                })}
                                            >
                                                {c.title ?? c.ada}
                                            </button>
                                            {c.decisionNumber && <span className="shrink-0 text-xs text-muted-foreground">{c.decisionNumber}</span>}
                                            {c.conflict && (
                                                <span className="truncate text-xs text-destructive">
                                                    {tPage('unplacedConflict')}: {c.conflict.subjectName}
                                                </span>
                                            )}
                                            <span className="ml-auto shrink-0">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs"
                                                    disabled={candidateBusy === c.id}
                                                    onClick={() => setPendingAction({
                                                        action: 'dismiss',
                                                        candidateId: c.id,
                                                        subjectName: null,
                                                        ...docOfCandidate(c),
                                                    })}
                                                >
                                                    {tPage('unplacedDismiss')}
                                                </Button>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </TooltipProvider>
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
                    pdfUrl={sheetAction.pdfUrl}
                    ada={sheetAction.ada}
                    subjectDescription={'subjectId' in sheetAction && sheetAction.subjectId
                        ? subjects.find(s => s.id === sheetAction.subjectId)?.description ?? null
                        : null}
                    agendaItemTitle={'subjectId' in sheetAction && sheetAction.subjectId
                        ? subjects.find(s => s.id === sheetAction.subjectId)?.agendaItemTitle ?? null
                        : null}
                    busy={sheetBusy}
                    extraContent={sheetAction.action === 'view' ? renderExtractedDetails(sheetAction.subjectId) : undefined}
                    onConfirm={confirmPending}
                    confirmDisabled={sheetAction.action === 'inspect' && sheetAction.subjectId === null}
                    onDismiss={sheetAction.action === 'inspect' ? async () => {
                        const ok = await handleDismissCandidate(sheetAction.candidateId);
                        if (ok) setPendingAction(null);
                    } : undefined}
                />
            )}

            {/* Danger zone — Delete extractions (meeting-wide wipe, superadmin only) */}
            {isSuperAdmin && !isLoading && extractedSubjects.length > 0 && (
                <div className="pt-2 border-t border-dashed">
                    <div className="flex items-center justify-between gap-4">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs shrink-0 border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
                            disabled={isClearing}
                            onClick={handleClearExtractedData}
                        >
                            {isClearing ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                                <RotateCcw className="h-3 w-3 mr-1" />
                            )}
                            {tPage('resetExtractions')}
                        </Button>
                        <span className="text-[11px] text-muted-foreground text-right">
                            {tPage('resetExtractionsDescription')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
