"use client"

import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, RotateCcw, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { AdminStrip, AdminToolButton } from '@/components/admin/AdminStrip';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import { DecisionWithSource, SubjectExtractedData } from '@/lib/db/decisions';
import { MeetingCandidate } from '@/lib/db/decisionCandidateShape';
import { getPollingHistoryForMeeting, requestPollDecisions, resolveCandidateConflict } from '@/lib/tasks/pollDecisions';
import { pollCadence } from '@/lib/tasks/pollDecisionsBackoff';
import { calculateVoteResult, voteCountsPhrase, voteResultSentence } from '@/lib/utils/votes';
import { formatCalendarDate, formatDate, formatNumericDate } from '@/lib/formatters/time';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { isDecisionConventions } from '@/lib/decisionConventions';
import { isRecordSubject, recordSection } from '@/lib/utils/subjects';
import { splitAttendance } from '@/lib/utils/attendance';
import { isMayorRole, isRoleActiveAt } from '@/lib/utils/roles';
import { hasRecordedVote, resultKey } from '@/lib/utils/decisionResult';
import { causeFromPayload, decisionWriteCause, DecisionWriteError } from '@/lib/utils/decisionWriteCause';
import { normalizeText } from '@/lib/utils';
import { TWO_COLUMN_GRID } from '@/components/ui/surface-card';
import { CollapsibleMarkdown, NameList, sortNamesByElectedOrder } from '@/components/meetings/decisions/shared';
import { scrollElementToContainerTop } from '@/lib/utils/scrollAnchor';
import { attentionCount, estimateWork, isLikelyMatch, routeCandidates, splitWaitingSubjects } from '@/components/meetings/decisions/candidates';
import { rowCandidates } from '@/components/meetings/decisions/rowCandidates';
import { QuestionsCard, type Receipt } from '@/components/meetings/decisions/QuestionsCard';
import { DecisionsTable, type DecisionsFilter, type TableRow } from '@/components/meetings/decisions/DecisionsTable';
import { auditSignalFor } from '@/components/meetings/decisions/auditSignal';
import { changeKey, documentCountsByChange } from '@/components/meetings/decisions/changeDocumentCounts';
import { AuditEvidence } from '@/components/meetings/decisions/AuditEvidence';
import { useAuditMode } from '@/components/meetings/decisions/useAuditMode';
import { LinkPanel, type PanelConfirm, type PanelSubject } from '@/components/meetings/decisions/LinkPanel';
import { SubjectPicker } from '@/components/meetings/decisions/SubjectPicker';
import type { DiavgeiaFooterState } from '@/components/meetings/decisions/DiavgeiaFooter';
import type { AdaEntry } from '@/components/meetings/decisions/AdaForm';
import { diavgeiaDocUrl } from '@/components/meetings/decisions/pdfUrl';
import { readDiavgeiaUnitEntries } from '@/lib/utils/diavgeiaUnitScope';
import { ConfirmSheet } from '@/components/meetings/decisions/ConfirmSheet';
import type { MinutesData, MinutesSubject } from '@/lib/minutes/types';
import { buildTimeline } from '@/components/meetings/decisions/timeline';
import { downloadFile } from '@/lib/export/download';
import { MinutesPreviewDialog } from '@/components/meetings/decisions/MinutesPreviewDialog';
import { DerivationDialog } from '@/components/meetings/decisions/DerivationDialog';
import { DecisionsRail } from '@/components/meetings/decisions/rail/DecisionsRail';
import type { ConventionsPanel } from '@/components/meetings/decisions/rail/ConventionsSection';
import type { DerivationOutput } from '@/lib/derivation/types';

/** MeetingCandidate as it arrives over JSON — dates serialized to strings. */
type CandidateView = Omit<MeetingCandidate, 'publishDate' | 'meetingDate'> & {
    publishDate: string | null;
    meetingDate: string | null;
};

/** The decisions route's payload, as the page reads it. */
interface DecisionsPayload {
    decisions: DecisionWithSource[];
    extractedData: SubjectExtractedData[];
    candidates?: CandidateView[];
    derivation?: DerivationOutput;
}

/** Every write the page can POST to the decisions route. */
type DecisionsAction =
    | { action: 'assignCandidate'; candidateId: string; subjectId: string }
    | { action: 'dismissCandidate'; candidateId: string }
    | { action: 'undismissCandidate'; candidateId: string }
    | { action: 'resetExtraction'; subjectId: string }
    | { action: 'clearExtractedData' };

/** The row panel: which row it belongs to, what it is doing, what it is asking. */
interface PanelState {
    subjectId: string;
    /** What the person opened it for. A row that fills itself from a background
     * poll while the panel is open must not re-title the panel mid-task, so the
     * "current decision" block follows this rather than the live row. */
    mode: 'link' | 'change';
    query: string;
    confirm: PanelConfirm | null;
    /** A failed write, shown inline. The row is unchanged when this is set. */
    error: string | null;
}

/** A rejected proposal, kept on the page so the row and its receipt can undo it together. */
interface RejectedProposal {
    candidateId: string;
    number: string;
    /** The receipt the same undo removes — otherwise the card keeps offering an
     * undo for a dismissal the row already took back, and the second click fails. */
    receiptId: string;
}

/** What the view sheet shows: a linked decision, or an unplaced candidate's document. */
interface SheetView {
    title: string | null;
    decisionNumber: string | null;
    pdfUrl: string;
    ada: string | null;
    /** Set only for a linked decision — the sheet names the subject it belongs to. */
    subjectId: string | null;
    subjectName: string | null;
}

/** The number a decision is known by; Diavgeia's filing protocol stands in until
 * `decisionNumber` is backfilled, and the label of last resort says only that a
 * decision is there. */
const decisionNumberOf = (decision: DecisionWithSource, fallback: string): string =>
    decision.decisionNumber || decision.protocolNumber || fallback;

const candidateNumberOf = (candidate: CandidateView): string => candidate.decisionNumber ?? candidate.ada;

/**
 * How many receipts the card keeps.
 *
 * A receipt exists for its undo, and that undo is short-lived by design — the
 * next answer supersedes it. Keeping every one of them pushed the Πίνακας off
 * the screen for the rest of a session on a long meeting, with nothing to
 * dismiss them.
 */
const MAX_RECEIPTS = 4;

/** Clearance from the scroll container's top edge when jumping to the table,
 * so the card's own border does not sit flush against it (and there is room
 * for a sticky header the container may gain later). */
const JUMP_TO_TABLE_MARGIN_PX = 16;

/** Index anything the derivation reports per subject. Rows with no subject —
 * the meeting-wide issues — belong to the rail's card, not to a table row. */
function bySubject<T extends { subjectId?: string }>(rows: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
        if (!row.subjectId) continue;
        const list = map.get(row.subjectId);
        if (list) list.push(row);
        else map.set(row.subjectId, [row]);
    }
    return map;
}

/** Turn a failed response into the error the page reads causes from. */
const writeFailure = async (response: Response): Promise<DecisionWriteError> => {
    const payload = await response.json().catch(() => null) as unknown;
    return new DecisionWriteError(causeFromPayload(payload), `HTTP ${response.status}`);
};

export function MeetingDecisionsPage({ isSuperAdmin }: { isSuperAdmin: boolean }) {
    // The mode lives here rather than in the rail that toggles it, because the
    // table and the sheet read it too, and a superadmin's choice must never
    // reach a page rendered for anyone else.
    const [auditModePreference, setAuditMode] = useAuditMode();
    const auditMode = isSuperAdmin && auditModePreference;
    const { toast } = useToast();
    const { subjects, meeting, city, people, getPerson } = useCouncilMeetingData();
    const t = useTranslations('admin.adminActions');
    const tPage = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');
    const locale = useLocale();
    const administrativeBodyId = meeting.administrativeBodyId ?? null;
    // What a poll would actually ask Diavgeia for. Parsed through the same
    // helper the task uses, so a malformed entry surfaces here — in the admin
    // page, before it fails a poll — rather than only in the task log.
    const pollScope = useMemo(
        () => readDiavgeiaUnitEntries(meeting.administrativeBody?.diavgeiaUnitIds),
        [meeting.administrativeBody?.diavgeiaUnitIds],
    );
    // The rules the derivation read this body's documents by, for the rail.
    // Parsed rather than asserted: an unparseable record is as good as none, and
    // the section says so. Nothing routes to a body on its own — its fields sit
    // in the city form — so the edit link goes to the city's own page, whose
    // admin strip opens that form.
    const conventionsPanel = useMemo<ConventionsPanel | null>(() => {
        const body = meeting.administrativeBody;
        if (!body) return null;
        return {
            rules: isDecisionConventions(body.decisionConventions) ? body.decisionConventions : null,
            bodyName: getLocalizedName(body, locale),
            cityName: getLocalizedMunicipalityName(city, locale),
            editHref: `/${city.id}`,
        };
    }, [meeting.administrativeBody, city, locale]);
    const meetingDate = new Date(meeting.dateTime);
    const mayorPersonId = people.find(p =>
        p.roles.some(r => isRoleActiveAt(r, meetingDate) && isMayorRole(r))
    )?.id ?? null;
    const presidentPersonId = people.find(p =>
        p.roles.some(r => isRoleActiveAt(r, meetingDate) && r.isHead && r.administrativeBodyId === administrativeBodyId)
    )?.id ?? null;

    const [decisions, setDecisions] = useState<Record<string, DecisionWithSource>>({});
    const [candidates, setCandidates] = useState<CandidateView[]>([]);
    const [extractedData, setExtractedData] = useState<Record<string, SubjectExtractedData>>({});
    const [derivation, setDerivation] = useState<DerivationOutput | null>(null);
    const [isRederiving, setIsRederiving] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [minutes, setMinutes] = useState<MinutesData | null>(null);
    const [minutesFailed, setMinutesFailed] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [derivationOpen, setDerivationOpen] = useState(false);
    const openDerivation = useCallback(() => setDerivationOpen(true), []);
    // Undefined for anyone but a superadmin. The audit line and the issues card
    // offer the link only when they are handed one, so withholding the callback
    // is what keeps the glossary out of a city admin's reach — no second
    // permission check down there to keep in step with this one.
    const explainDerivation = isSuperAdmin ? openDerivation : undefined;
    const [pollingStatus, setPollingStatus] = useState<Awaited<ReturnType<typeof getPollingHistoryForMeeting>> | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [resettingSubjectId, setResettingSubjectId] = useState<string | null>(null);
    const [busySubjectId, setBusySubjectId] = useState<string | null>(null);
    const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);

    const [filter, setFilter] = useState<DecisionsFilter>('all');
    const [subjectQuery, setSubjectQuery] = useState('');
    const [panel, setPanel] = useState<PanelState | null>(null);
    const [pickerCandidateId, setPickerCandidateId] = useState<string | null>(null);
    const [pickerQuery, setPickerQuery] = useState('');
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    /** Candidates set aside in this session, by id. The route only sends
     * unresolved candidates, so a dismissed one is gone from `candidates` on
     * the next load — and its receipt could no longer show what it set aside. */
    const [setAside, setSetAside] = useState<Record<string, CandidateView>>({});
    const [rejected, setRejected] = useState<Record<string, RejectedProposal>>({});
    const [viewing, setViewing] = useState<string | null>(null);
    // Bumped by handleJumpToTable; the effect below fires after the filter
    // change it triggers has committed, so it measures the table at its new
    // (post-filter) height rather than the one before the click.
    const [jumpToTableRequest, setJumpToTableRequest] = useState(0);
    const tableRef = useRef<HTMLDivElement>(null);
    const receiptSeq = useRef(0);
    /** The last write the row panel sent. Its error strip sends this one again:
     * a "Δοκιμή ξανά" that only cleared the error flag promised a second attempt
     * and made none. */
    const panelRetry = useRef<(() => void) | null>(null);

    const fetchDecisions = useCallback(async (): Promise<DecisionsPayload | null> => {
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`);
            if (!response.ok) {
                // An empty page and a failed load must not look the same: 0/N
                // linked would invite re-linking work that already exists.
                setLoadFailed(true);
                return null;
            }
            const data = await response.json() as DecisionsPayload;
            const decisionMap: Record<string, DecisionWithSource> = {};
            for (const decision of data.decisions) decisionMap[decision.subjectId] = decision;
            const extractedMap: Record<string, SubjectExtractedData> = {};
            for (const extracted of data.extractedData) extractedMap[extracted.subjectId] = extracted;
            setDecisions(decisionMap);
            setCandidates(data.candidates ?? []);
            setExtractedData(extractedMap);
            setDerivation(data.derivation ?? null);
            setLoadFailed(false);
            return data;
        } catch {
            setLoadFailed(true);
            return null;
        } finally {
            setHasLoaded(true);
        }
    }, [meeting.cityId, meeting.id]);

    const refreshPollingStatus = useCallback(async () => {
        const next = await getPollingHistoryForMeeting(meeting.cityId, meeting.id).catch(() => null);
        if (next) setPollingStatus(next);
    }, [meeting.cityId, meeting.id]);

    // The minutes route is the one source of the discussion order and the
    // per-subject minutes facts, so the page and the DOCX cannot drift apart.
    const fetchMinutes = useCallback(async () => {
        setMinutesFailed(false);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/minutes?format=json`);
            if (!response.ok) { setMinutesFailed(true); return; }
            setMinutes(await response.json() as MinutesData);
        } catch {
            setMinutesFailed(true);
        }
    }, [meeting.cityId, meeting.id]);

    useEffect(() => {
        fetchDecisions();
        refreshPollingStatus();
    }, [fetchDecisions, refreshPollingStatus]);

    useEffect(() => { fetchMinutes(); }, [fetchMinutes]);

    // A poll runs on another service, so nothing tells the page when it lands.
    // While one is in flight the page asks again every ten seconds and, the
    // moment the task is gone, reloads decisions and minutes together — a
    // landed poll is a write to a subject's decision, so it leaves the
    // minutes just as stale as `refreshAfterWrite` treats one.
    useEffect(() => {
        if (!pollingStatus?.pendingTaskId) return;
        const timer = setInterval(async () => {
            const next = await getPollingHistoryForMeeting(meeting.cityId, meeting.id).catch(() => null);
            if (!next) return;
            setPollingStatus(next);
            if (!next.pendingTaskId) await Promise.all([fetchDecisions(), fetchMinutes()]);
        }, 10_000);
        return () => clearInterval(timer);
    }, [pollingStatus?.pendingTaskId, meeting.cityId, meeting.id, fetchDecisions, fetchMinutes]);

    const minutesById = useMemo(
        () => new Map<string, MinutesSubject>((minutes?.subjects ?? []).map(s => [s.subjectId, s])),
        [minutes],
    );
    const timeline = useMemo(() => (minutes ? buildTimeline(minutes) : null), [minutes]);
    const subjectById = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);

    /** The name every surface of the record shows: the agenda item's own title
     * when the minutes resolved one, the summary's name otherwise. */
    const displayName = useCallback(
        (subject: { id: string; name: string }): string => minutesById.get(subject.id)?.name ?? subject.name,
        [minutesById],
    );

    /**
     * How a sentence on this page names a subject — always with its article.
     *
     * The Greek copy contracts «σε» with it (`σ{subject}` → "στο θέμα 30"), so a
     * label built any other way renders ungrammatical Greek. `LinkPanel` and
     * `SubjectPicker` both document this contract on the props fed from here.
     */
    const labelOf = useCallback(
        (subject: { id: string; name: string; agendaItemIndex: number | null }): string =>
            subject.agendaItemIndex !== null
                ? tPage('subjectLabel.numbered', { n: subject.agendaItemIndex })
                : tPage('subjectLabel.named', { name: displayName(subject) }),
        [tPage, displayName],
    );

    const labelOfId = useCallback((subjectId: string): string | null => {
        const subject = subjectById.get(subjectId);
        return subject ? labelOf(subject) : null;
    }, [subjectById, labelOf]);

    /**
     * What a failed write says to the person who asked for it.
     *
     * The server's causes are a closed set (`decisionWriteCause`), and every
     * one of them has copy here — the panel's error strip and the toasts both
     * read this, so neither can fall back to the English sentence the server
     * threw. A cause the set does not name still gets a sentence.
     */
    const failureSentence = useCallback((error: unknown): string => {
        const cause = decisionWriteCause(error);
        switch (cause.code) {
            case 'adaLinkedElsewhere': {
                const holder = cause.subjectId ? labelOfId(cause.subjectId) : null;
                return holder
                    ? tPage('writeFailure.adaLinkedTo', { subject: holder })
                    : tPage('writeFailure.adaLinkedElsewhere');
            }
            case 'subjectHasDecision': return tPage('writeFailure.subjectHasDecision');
            case 'candidateResolved': return tPage('writeFailure.candidateResolved');
            case 'candidateNotFound': return tPage('writeFailure.candidateNotFound');
            case 'candidateNotDismissed': return tPage('writeFailure.candidateNotDismissed');
            case 'subjectNotFound': return tPage('writeFailure.subjectNotFound');
            case 'notAllowed': return tPage('writeFailure.notAllowed');
            case 'otherCity': return tPage('writeFailure.otherCity');
            case 'unknown': return tPage('writeFailure.unknown');
        }
    }, [tPage, labelOfId]);

    // ─── The view model ──────────────────────────────────────────────────

    const recordSubjects = useMemo(() => subjects.filter(isRecordSubject), [subjects]);
    /** Agenda order, the order a posted Πίνακας is written in: the items taken
     * up out of the agenda first, then the agenda itself by index. */
    const orderedSubjects = useMemo(() => [
        ...recordSubjects.filter(s => recordSection(s) === 'outOfAgenda'),
        ...recordSubjects.filter(s => recordSection(s) === 'agenda')
            .sort((a, b) => (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0)),
    ], [recordSubjects]);

    const hasDecision = useCallback((id: string) => Boolean(decisions[id]), [decisions]);
    const routed = useMemo(
        () => routeCandidates(candidates, recordSubjects, hasDecision),
        [candidates, recordSubjects, hasDecision],
    );
    const waiting = useMemo(
        () => splitWaitingSubjects(orderedSubjects, hasDecision, routed.proposalBySubject),
        [orderedSubjects, hasDecision, routed],
    );
    /** Which subject holds each candidate's ΑΔΑ. The route only sends candidates
     * nothing has resolved yet, so an entry here is a candidate whose ΑΔΑ a
     * decision already took — the row panel's "move it here" case. */
    const subjectByCandidate = useMemo(() => {
        const map = new Map<string, string>();
        for (const [subjectId, decision] of Object.entries(decisions)) {
            const candidate = candidates.find(c => c.ada === decision.ada);
            if (candidate) map.set(candidate.id, subjectId);
        }
        return map;
    }, [decisions, candidates]);

    // ─── What the derivation says, per subject ───────────────────────────
    //
    // The audit line and the sheet's evidence both ask the same three questions
    // of one subject, so the meeting-wide output is indexed once here rather
    // than scanned per row.

    const issuesBySubject = useMemo(() => bySubject(derivation?.issues ?? []), [derivation]);
    const derivedVotesBySubject = useMemo(() => bySubject(derivation?.votes ?? []), [derivation]);
    const derivedAttendanceBySubject = useMemo(() => bySubject(derivation?.attendance ?? []), [derivation]);
    /** How many of the meeting's documents stated each change (`changeKey`): the
     * audit line looks the counts up here instead of `src/lib/minutes` carrying them too. */
    const eventDocumentCounts = useMemo(() => documentCountsByChange(derivation?.events ?? []), [derivation]);
    /** Subjects whose outcome is the document's phrase with nobody behind it. */
    const phraseOnlySubjects = useMemo(
        () => new Set(derivation?.phraseOnlySubjectIds ?? []),
        [derivation],
    );

    const rows: TableRow[] = orderedSubjects.map(subject => {
        const decision = decisions[subject.id];
        const votes = extractedData[subject.id]?.votes ?? [];
        const result = resultKey({ withdrawn: subject.withdrawn, hasDecision: Boolean(decision), votes });
        const proposal = decision ? undefined : routed.proposalBySubject.get(subject.id);
        return {
            subject: {
                id: subject.id,
                name: displayName(subject),
                agendaItemIndex: subject.agendaItemIndex,
                nonAgendaReason: subject.nonAgendaReason,
                withdrawn: subject.withdrawn,
            },
            decision: decision
                ? {
                    number: decisionNumberOf(decision, tPage('table.linked')),
                    manualBy: decision.createdBy?.name || decision.createdBy?.email || null,
                }
                : null,
            result,
            // A dash means two different things and only one of them explains
            // itself: a linked decision whose document records no vote. A row
            // with nothing linked yet has nothing to explain.
            resultHint: result === 'noVote' ? tPage('table.noVoteHint') : null,
            voteCounts: hasRecordedVote(result) ? voteCountsPhrase(tPage, calculateVoteResult(votes)) : null,
            proposal: proposal
                ? {
                    candidateId: proposal.id,
                    number: candidateNumberOf(proposal),
                    title: proposal.title,
                    likely: isLikelyMatch(proposal),
                }
                : null,
            rejected: rejected[subject.id]
                ? { candidateId: rejected[subject.id].candidateId, number: rejected[subject.id].number }
                : null,
            // Only under the mode: the row is the clerk's table for everyone
            // else, and a line about how a fact was reached is not theirs.
            audit: auditMode
                ? auditSignalFor({
                    issues: issuesBySubject.get(subject.id) ?? [],
                    phraseOnly: phraseOnlySubjects.has(subject.id),
                    votes: derivedVotesBySubject.get(subject.id) ?? [],
                })
                : null,
        };
    });

    const query = normalizeText(subjectQuery.trim());
    const matchesQuery = (row: TableRow): boolean => {
        if (!query) return true;
        const subject = subjectById.get(row.subject.id);
        const haystack = [row.subject.name, subject?.agendaItemTitle ?? null];
        const decision = decisions[row.subject.id];
        if (decision) haystack.push(decision.title, decision.ada, decision.decisionNumber, decision.protocolNumber);
        return haystack.some(value => value !== null && value !== undefined && normalizeText(value).includes(query));
    };
    const visibleRows = query ? rows.filter(matchesQuery) : rows;
    const missingCount = visibleRows.filter(row => row.result === 'none').length;
    const auditCount = visibleRows.filter(row => row.audit?.needsCheck).length;

    // The table hides a chip at zero, so a filter still set to the one that just
    // emptied would strand the clerk on an empty table with no control to get
    // back — at the moment the last row is filled in, which is the success path
    // of the whole page. Whether a filter still holds is a function of the
    // counts, not an event, so it is answered here; `filter` stays the choice
    // that was made, and applies again as soon as its rows come back.
    const chipCount: Record<DecisionsFilter, number> = { all: visibleRows.length, missing: missingCount, audit: auditCount };
    const effectiveFilter: DecisionsFilter = chipCount[filter] === 0 ? 'all' : filter;

    // A poll or another admin can fill a row after its proposal was rejected.
    // The rejection is settled then, and a kept entry would show its "Αναίρεση"
    // again the moment the decision is removed later.
    useEffect(() => {
        setRejected(current => {
            const next = Object.fromEntries(Object.entries(current).filter(([subjectId]) => !decisions[subjectId]));
            return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
    }, [decisions]);
    const beforeAgenda = subjects
        .filter(subject => !isRecordSubject(subject))
        .map(subject => ({ id: subject.id, name: displayName(subject) }))
        .filter(subject => !query || normalizeText(subject.name).includes(query));

    const decidableSubjects = recordSubjects.filter(s => !s.withdrawn);
    /** Whether anything on this meeting was extracted — an excerpt counts, so a
     * reset stays offered for a decision whose document yielded no vote. */
    const hasExtractions = decidableSubjects.some(s => decisions[s.id]?.excerpt || extractedData[s.id]);

    /** Every candidate the card renders as a conflict, so the unmatched list
     * below it does not offer the same decision a second time. */
    const conflictCandidateIds = new Set([...routed.conflictsByHolder.values()].map(c => c.id));
    const conflicts = [...routed.conflictsByHolder.entries()].map(([holderId, candidate]) => {
        const claimantId = candidate.subjectId && candidate.subjectId !== holderId ? candidate.subjectId : null;
        const claimantLabel = claimantId ? labelOfId(claimantId) : null;
        // A subject with no agenda number gets a full-name label too long for
        // a button (`labelOf` above) — the card's buttons fall back to a
        // plain outcome word instead, so they need to know this up front
        // rather than parse it back out of the label.
        const claimantSubject = claimantId ? subjectById.get(claimantId) : undefined;
        return {
            candidateId: candidate.id,
            number: candidateNumberOf(candidate),
            title: candidate.title,
            holder: {
                id: holderId,
                // A holder outside this meeting has no row to name, so the
                // decision's own record of the subject's name stands in.
                label: labelOfId(holderId)
                    ?? tPage('subjectLabel.named', { name: candidate.conflict?.subjectName ?? '' }),
                // A holder outside this meeting has no agenda number either.
                hasAgendaNumber: subjectById.get(holderId)?.agendaItemIndex != null,
            },
            claimant: claimantId && claimantLabel
                ? { id: claimantId, label: claimantLabel, hasAgendaNumber: claimantSubject?.agendaItemIndex != null }
                : null,
        };
    });
    const unplacedCandidates = routed.trayCandidates.filter(c => !conflictCandidateIds.has(c.id));
    const unplaced = unplacedCandidates.map(candidate => ({
        candidateId: candidate.id,
        number: candidateNumberOf(candidate),
        title: candidate.title,
        publishedOn: candidate.publishDate ? formatCalendarDate(candidate.publishDate, locale) : '',
    }));
    // The card counts what it renders: a conflicting candidate is one question,
    // not two, even though `routeCandidates` reports it in both buckets.
    const attention = { trayCandidates: unplacedCandidates, conflictsByHolder: routed.conflictsByHolder };
    const total = attentionCount(attention, waiting);
    const estimate = estimateWork(attention, waiting);

    const pollState: DiavgeiaFooterState = pollCadence({
        canPoll: Boolean(city.diavgeiaUid) && pollScope.every(entry => entry.scope !== null),
        pollInFlight: Boolean(pollingStatus?.pendingTaskId),
    });

    // ─── Writes ──────────────────────────────────────────────────────────

    const postAction = async (body: DecisionsAction): Promise<void> => {
        const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) throw await writeFailure(response);
    };

    const putDecision = async (body: { subjectId: string; ada: string; decisionNumber: string | null; pdfUrl: string }): Promise<void> => {
        const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subjectId: body.subjectId,
                ada: body.ada,
                pdfUrl: body.pdfUrl,
                ...(body.decisionNumber ? { decisionNumber: body.decisionNumber } : {}),
            }),
        });
        if (!response.ok) throw await writeFailure(response);
    };

    const deleteDecision = async (subjectId: string): Promise<void> => {
        const response = await fetch(
            `/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions?subjectId=${encodeURIComponent(subjectId)}`,
            { method: 'DELETE' },
        );
        if (!response.ok) throw await writeFailure(response);
    };

    const addReceipt = (
        text: string,
        undo?: (receiptId: string) => void,
        open?: Receipt['open'],
    ): string => {
        const id = `receipt-${++receiptSeq.current}`;
        setReceipts(list => [
            ...list,
            { id, text, ...(open ? { open } : {}), ...(undo ? { undo: () => undo(id) } : {}) },
        ].slice(-MAX_RECEIPTS));
        return id;
    };
    const dropReceipt = (receiptId: string) => setReceipts(list => list.filter(r => r.id !== receiptId));

    /**
     * Reload what a write just invalidated.
     *
     * The minutes carry each subject's decision number and excerpt, so a write
     * that changed a subject's decision leaves them stale too — the preview
     * would then show an item the DOCX export, which fetches fresh, contains.
     */
    const refreshAfterWrite = async (changesDecision: boolean): Promise<void> => {
        if (changesDecision) {
            await Promise.all([fetchDecisions(), fetchMinutes()]);
            return;
        }
        await fetchDecisions();
    };

    /**
     * Run one write and leave the page truthful whatever it does.
     *
     * A failure inside the row panel stays in the row panel — the design's rule
     * that an outcome with a place of its own never becomes a toast — and the
     * panel's note says the row is unchanged, so only a write that changed
     * nothing may report itself there.
     */
    const runWrite = async (
        busy: { subjectId?: string; candidateId?: string; inPanel?: boolean; changesDecision?: boolean },
        write: () => Promise<void>,
    ): Promise<boolean> => {
        if (busy.subjectId) setBusySubjectId(busy.subjectId);
        if (busy.candidateId) setBusyCandidateId(busy.candidateId);
        if (busy.inPanel) setPanel(p => p && { ...p, error: null });
        try {
            await write();
            await refreshAfterWrite(busy.changesDecision ?? false);
            return true;
        } catch (error) {
            if (busy.inPanel) setPanel(p => p && { ...p, confirm: null, error: failureSentence(error) });
            // The cause belongs under a title that names what failed: on its
            // own, "the ΑΔΑ is already on θέμα 30" reads as a statement of
            // fact rather than as the reason the change did not happen.
            else toast({ title: tPage('writeError'), description: failureSentence(error), variant: 'destructive' });
            return false;
        } finally {
            setBusySubjectId(null);
            setBusyCandidateId(null);
        }
    };

    /**
     * Put back the link the first half of a replace or a move already removed.
     *
     * Those two are sent as a delete and then a link, with no transaction
     * between them (a transactional replace is a recorded follow-up). When the
     * second call fails, a candidate-backed decision can be re-linked from the
     * candidate the delete returned to the unresolved pool — found by its ΑΔΑ,
     * which is the only name the pool and the deleted decision share. A
     * decision no candidate backs cannot come back, and the confirmation said
     * so before the person pressed the button.
     *
     * The reload comes first, before any answer this can give: the delete has
     * already landed by the time this runs, so a path that returns without it
     * would leave the table showing a decision that no longer exists while the
     * toast says the subject has none.
     */
    const relinkAfterFailure = async (subjectId: string, removed: DecisionWithSource): Promise<boolean> => {
        const [data] = await Promise.all([fetchDecisions(), fetchMinutes()]);
        if (!removed.candidateBacked || !removed.ada) return false;
        const candidate = data?.candidates?.find(c => c.ada === removed.ada);
        if (!candidate) return false;
        try {
            await postAction({ action: 'assignCandidate', candidateId: candidate.id, subjectId });
        } catch {
            return false;
        }
        await Promise.all([fetchDecisions(), fetchMinutes()]);
        return true;
    };

    /** Delete one link, then make the other: the shared body of replace and move. */
    const replaceLink = async (args: {
        loserSubjectId: string;
        loserDecision: DecisionWithSource;
        winnerSubjectId: string;
        candidateId: string;
        onDone: () => void;
    }): Promise<void> => {
        setBusySubjectId(args.winnerSubjectId);
        setPanel(p => p && { ...p, error: null });
        try {
            await deleteDecision(args.loserSubjectId);
        } catch (error) {
            setBusySubjectId(null);
            setPanel(p => p && { ...p, confirm: null, error: failureSentence(error) });
            return;
        }
        try {
            await postAction({ action: 'assignCandidate', candidateId: args.candidateId, subjectId: args.winnerSubjectId });
            await refreshAfterWrite(true);
            args.onDone();
        } catch (error) {
            const restored = await relinkAfterFailure(args.loserSubjectId, args.loserDecision);
            if (restored) {
                setPanel(p => p && { ...p, confirm: null, error: failureSentence(error) });
            } else {
                // The panel's note promises the row is unchanged, which is no
                // longer true: say what is actually on the screen instead.
                setPanel(null);
                toast({
                    title: tPage('panel.replaceHalfDone', {
                        number: decisionNumberOf(args.loserDecision, tPage('table.linked')),
                    }),
                    variant: 'destructive',
                });
            }
        } finally {
            setBusySubjectId(null);
        }
    };

    const handleLink = async (subjectId: string, candidateId: string, inPanel: boolean) => {
        const candidate = candidates.find(c => c.id === candidateId);
        const subject = subjectById.get(subjectId);
        if (!candidate || !subject) return;
        if (inPanel) panelRetry.current = () => { void handleLink(subjectId, candidateId, true); };
        const ok = await runWrite({ subjectId, candidateId, inPanel, changesDecision: true }, () =>
            postAction({ action: 'assignCandidate', candidateId, subjectId }));
        if (!ok) return;
        setPanel(null);
        setPickerCandidateId(null);
        addReceipt(
            tPage('receipts.linked', { number: candidateNumberOf(candidate), subject: labelOf(subject) }),
            receiptId => { void handleUndoLink(subjectId, receiptId); },
        );
    };

    const handleUndoLink = async (subjectId: string, receiptId: string) => {
        const ok = await runWrite({ subjectId, changesDecision: true }, () => deleteDecision(subjectId));
        if (ok) dropReceipt(receiptId);
    };

    const handleAdaLink = async (subjectId: string, entry: AdaEntry) => {
        const subject = subjectById.get(subjectId);
        if (!subject) return;
        panelRetry.current = () => { void handleAdaLink(subjectId, entry); };
        const ok = await runWrite({ subjectId, inPanel: true, changesDecision: true }, () => putDecision({
            subjectId,
            ada: entry.ada,
            decisionNumber: entry.decisionNumber,
            pdfUrl: diavgeiaDocUrl(entry.ada),
        }));
        if (!ok) return;
        setPanel(null);
        addReceipt(tPage('receipts.linked', {
            number: entry.decisionNumber ?? entry.ada,
            subject: labelOf(subject),
        }));
        // A decision typed in by hand carries no excerpt, no attendance and no
        // votes. The poll's re-extraction path fills them, so the Αποτέλεσμα
        // column has something to say without anyone asking for it.
        await requestPollDecisions(meeting.cityId, meeting.id).catch(() => undefined);
        await refreshPollingStatus();
    };

    const handleUnlink = async (subjectId: string) => {
        panelRetry.current = () => { void handleUnlink(subjectId); };
        const ok = await runWrite({ subjectId, inPanel: true, changesDecision: true }, () => deleteDecision(subjectId));
        if (ok) setPanel(null);
    };

    const handleAccept = (subjectId: string, candidateId: string) => {
        void handleLink(subjectId, candidateId, false);
    };

    const handleReject = async (subjectId: string, candidateId: string) => {
        const candidate = candidates.find(c => c.id === candidateId);
        if (!candidate) return;
        const number = candidateNumberOf(candidate);
        const ok = await runWrite({ subjectId, candidateId }, () =>
            postAction({ action: 'dismissCandidate', candidateId }));
        if (!ok) return;
        // The id has to travel with the call, the way `handleUndoLink` and
        // `handleUndoDismiss` take theirs: a closure over the `rejected` map
        // captures the render before this rejection was written to it, so the
        // receipt would never find itself and would keep offering its undo.
        const receiptId = addReceipt(
            tPage('receipts.rejected', { number }),
            id => { void handleUndoReject(subjectId, candidateId, id); },
        );
        setRejected(current => ({ ...current, [subjectId]: { candidateId, number, receiptId } }));
    };

    const handleUndoReject = async (subjectId: string, candidateId: string, receiptId: string | null) => {
        const ok = await runWrite({ subjectId, candidateId }, () =>
            postAction({ action: 'undismissCandidate', candidateId }));
        if (!ok) return;
        if (receiptId) dropReceipt(receiptId);
        setRejected(current => {
            const next = { ...current };
            delete next[subjectId];
            return next;
        });
    };

    const handleDismiss = async (candidateId: string) => {
        const candidate = candidates.find(c => c.id === candidateId);
        if (!candidate) return;
        const number = candidateNumberOf(candidate);
        const ok = await runWrite({ candidateId }, () => postAction({ action: 'dismissCandidate', candidateId }));
        if (!ok) return;
        setPickerCandidateId(null);
        setSetAside(current => ({ ...current, [candidateId]: candidate }));
        addReceipt(
            tPage('receipts.dismissed', { number }),
            receiptId => { void handleUndoDismiss(candidateId, receiptId); },
            { label: number, onOpen: () => setViewing(candidateId) },
        );
    };

    const handleUndoDismiss = async (candidateId: string, receiptId: string) => {
        const ok = await runWrite({ candidateId }, () => postAction({ action: 'undismissCandidate', candidateId }));
        if (!ok) return;
        dropReceipt(receiptId);
        setSetAside(current => {
            const next = { ...current };
            delete next[candidateId];
            return next;
        });
    };

    /**
     * Both answers to a conflict go through the one server action that settles
     * it inside a transaction — the page never has to take a decision off one
     * subject and hope the other call lands.
     */
    const resolveConflict = async (candidateId: string, resolution: 'reassign' | 'dismiss') => {
        const conflict = conflicts.find(c => c.candidateId === candidateId);
        if (!conflict) return;
        setBusyCandidateId(candidateId);
        try {
            const outcome = await resolveCandidateConflict(candidateId, resolution);
            await refreshAfterWrite(outcome === 'reassigned');
            // 'noop' means someone else settled it first; the refreshed page
            // already shows what actually happened, so it gets no receipt.
            if (outcome === 'reassigned' && conflict.claimant) {
                addReceipt(tPage('receipts.moved', { number: conflict.number, subject: conflict.claimant.label }));
            } else if (outcome === 'dismissed') {
                addReceipt(tPage('receipts.kept', { number: conflict.number, subject: conflict.holder.label }));
            }
        } catch (error) {
            toast({ title: tPage('writeError'), description: failureSentence(error), variant: 'destructive' });
        } finally {
            setBusyCandidateId(null);
        }
    };

    const handleJumpToTable = () => {
        // A search that matches only linked rows would land the jump on an
        // empty table, having promised the missing ones.
        setSubjectQuery('');
        setFilter('missing');
        setJumpToTableRequest(request => request + 1);
    };

    // Runs after the filter/query change above has committed and the table
    // has re-rendered at its new height, so the measurement below reflects
    // the layout the user actually sees rather than the one before the click.
    useEffect(() => {
        if (jumpToTableRequest === 0) return;
        if (tableRef.current) scrollElementToContainerTop(tableRef.current, JUMP_TO_TABLE_MARGIN_PX);
    }, [jumpToTableRequest]);

    const handlePoll = async (forceExtract: boolean) => {
        setIsPolling(true);
        try {
            await requestPollDecisions(meeting.cityId, meeting.id, forceExtract ? { forceExtract: true } : undefined);
            await refreshPollingStatus();
        } catch (error) {
            toast({ title: tPage('pollError'), description: failureSentence(error), variant: 'destructive' });
        } finally {
            setIsPolling(false);
        }
    };

    const handleResetExtraction = async (subjectId: string) => {
        setResettingSubjectId(subjectId);
        try {
            await postAction({ action: 'resetExtraction', subjectId });
            toast({ title: tPage('extractionReset') });
            await Promise.all([fetchDecisions(), fetchMinutes()]);
        } catch (error) {
            toast({ title: tPage('resetError'), description: failureSentence(error), variant: 'destructive' });
        } finally {
            setResettingSubjectId(null);
        }
    };

    const handleClearExtractedData = async () => {
        if (!confirm(tPage('resetExtractionsConfirm'))) return;
        setIsClearing(true);
        try {
            await postAction({ action: 'clearExtractedData' });
            toast({ title: tPage('resetExtractions') });
            await Promise.all([fetchDecisions(), fetchMinutes()]);
        } catch (error) {
            toast({ title: tPage('resetError'), description: failureSentence(error), variant: 'destructive' });
        } finally {
            setIsClearing(false);
        }
    };

    /** Re-run the derivation over the facts already stored, then show what it produced. */
    const handleRederive = async () => {
        setIsRederiving(true);
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rederive' }),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            // The derived rows are what the minutes read, so both are refetched.
            await Promise.all([fetchDecisions(), fetchMinutes()]);
        } catch (error) {
            toast({ title: tPage('rederive'), description: `${error}`, variant: 'destructive' });
        } finally {
            setIsRederiving(false);
        }
    };

    const handleExportDocx = async () => {
        try {
            const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/minutes`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            downloadFile(await response.blob(), `minutes-${city.id}-${meeting.id}.docx`);
            toast({ title: t('minutes.exportSuccess') });
        } catch {
            toast({ title: t('minutes.exportError'), variant: 'destructive' });
        }
    };

    // ─── The panel, the picker and the sheet ─────────────────────────────

    const openPanel = (subjectId: string, mode: 'link' | 'change') => {
        setPickerCandidateId(null);
        panelRetry.current = null;
        setPanel({ subjectId, mode, query: '', confirm: null, error: null });
    };

    /** A pick in the row panel adds when the row is empty and replaces when it
     * is not. The panel asks for nothing on its own — it does not know that a
     * row has something to lose, which is what makes a replace a question. */
    const handlePanelPick = (subjectId: string, candidateId: string) => {
        const current = decisions[subjectId];
        if (!current) {
            void handleLink(subjectId, candidateId, true);
            return;
        }
        setPanel(p => p && {
            ...p,
            confirm: {
                kind: 'replace',
                candidateId,
                current: {
                    number: decisionNumberOf(current, tPage('table.linked')),
                    reversible: current.candidateBacked ?? false,
                },
            },
        });
    };

    const handlePanelConfirm = (subjectId: string, confirm: PanelConfirm) => {
        panelRetry.current = () => handlePanelConfirm(subjectId, confirm);
        if (confirm.kind === 'unlink') {
            void handleUnlink(subjectId);
            return;
        }
        const subject = subjectById.get(subjectId);
        const candidate = candidates.find(c => c.id === confirm.candidateId);
        if (!subject || !candidate) return;
        const loserSubjectId = confirm.kind === 'replace' ? subjectId : subjectByCandidate.get(confirm.candidateId);
        const loserDecision = loserSubjectId ? decisions[loserSubjectId] : undefined;
        // Nothing left to take away — a poll or another admin already emptied
        // the row this was going to displace. What the person asked for is now
        // a plain link, so send that rather than stall on a confirmation the
        // page can no longer act on.
        if (!loserSubjectId || !loserDecision) {
            void handleLink(subjectId, confirm.candidateId, true);
            return;
        }
        void replaceLink({
            loserSubjectId,
            loserDecision,
            winnerSubjectId: subjectId,
            candidateId: confirm.candidateId,
            onDone: () => {
                setPanel(null);
                const number = candidateNumberOf(candidate);
                const label = labelOf(subject);
                addReceipt(confirm.kind === 'replace'
                    ? tPage('receipts.linked', { number, subject: label })
                    : tPage('receipts.moved', { number, subject: label }));
            },
        });
    };

    /** The other rows a panel's list can name: every subject of the record,
     * labelled the way the copy expects. */
    const panelSubjects: PanelSubject[] = orderedSubjects.map(subject => ({ id: subject.id, label: labelOf(subject) }));

    const renderPanel = (subjectId: string): ReactNode => {
        if (!panel || panel.subjectId !== subjectId) return null;
        const subject = subjectById.get(subjectId);
        if (!subject) return null;
        const current = panel.mode === 'change' ? decisions[subjectId] : undefined;
        return (
            <LinkPanel
                subjectLabel={labelOf(subject)}
                hasAgendaNumber={subject.agendaItemIndex !== null}
                current={current
                    ? {
                        id: current.id,
                        number: decisionNumberOf(current, tPage('table.linked')),
                        title: current.title,
                        reversible: current.candidateBacked ?? false,
                    }
                    : null}
                rows={rowCandidates({
                    subjectId,
                    candidates,
                    subjectByCandidate,
                    subjects: panelSubjects,
                    query: panel.query,
                })}
                query={panel.query}
                onQueryChange={value => setPanel(p => p && { ...p, query: value })}
                confirm={panel.confirm}
                onAskConfirm={confirm => setPanel(p => p && { ...p, confirm })}
                onCancelConfirm={() => setPanel(p => p && { ...p, confirm: null })}
                onConfirm={confirm => handlePanelConfirm(subjectId, confirm)}
                onLink={candidateId => handlePanelPick(subjectId, candidateId)}
                onAdaSubmit={entry => { void handleAdaLink(subjectId, entry); }}
                onOpenDocument={setViewing}
                onClose={() => setPanel(null)}
                saving={busySubjectId === subjectId}
                error={panel.error}
                onRetry={() => {
                    setPanel(p => p && { ...p, error: null });
                    panelRetry.current?.();
                }}
            />
        );
    };

    const renderPicker = (candidateId: string): ReactNode => {
        const candidate = candidates.find(c => c.id === candidateId);
        if (!candidate) return null;
        const waitingIds = new Set([...waiting.proposed, ...waiting.plain].map(s => s.id));
        const pickerQueryText = normalizeText(pickerQuery.trim());
        const options = orderedSubjects
            .filter(subject => waitingIds.has(subject.id))
            // The resolver's own suggestion first: it is the answer the person
            // is most likely looking for, and the list is otherwise long.
            .sort((a, b) => Number(b.id === candidate.subjectId) - Number(a.id === candidate.subjectId))
            .map(subject => ({
                id: subject.id,
                label: labelOf(subject),
                hasAgendaNumber: subject.agendaItemIndex !== null,
                name: displayName(subject),
                likely: subject.id === candidate.subjectId && isLikelyMatch(candidate),
                waitingAnswer: routed.proposalBySubject.has(subject.id),
            }))
            .filter(option => !pickerQueryText
                || normalizeText(option.label).includes(pickerQueryText)
                || normalizeText(option.name).includes(pickerQueryText));
        return (
            <SubjectPicker
                decisionNumber={candidateNumberOf(candidate)}
                subjects={options}
                query={pickerQuery}
                onQueryChange={setPickerQuery}
                onPick={subjectId => { void handleLink(subjectId, candidateId, false); }}
                onDismiss={() => { void handleDismiss(candidateId); }}
                onClose={() => setPickerCandidateId(null)}
                saving={busyCandidateId === candidateId}
            />
        );
    };

    /**
     * What audit mode adds to the extraction pane: where each derived name came
     * from, the phrase that licensed the inferences, the printed tally beside
     * the derived one, the sentences behind the attendance changes, and this
     * subject's issues as text rather than as tooltips.
     *
     * Null when the mode is off — the ordinary pane above is untouched — and
     * null too when the derivation left this subject nothing to show.
     */
    const renderAuditEvidence = (subjectId: string): ReactNode => {
        if (!auditMode) return null;
        const decision = decisions[subjectId];
        const issues = issuesBySubject.get(subjectId) ?? [];
        const votes = derivedVotesBySubject.get(subjectId) ?? [];
        const attendance = derivedAttendanceBySubject.get(subjectId) ?? [];
        const tally = issues.find(issue => issue.code === 'TALLY_MISMATCH');
        const diffs = tally?.code === 'TALLY_MISMATCH' ? tally.params.diffs : [];
        const changes = (minutes?.attendanceChanges ?? []).flatMap(change => {
            if (change.atSubject.id !== subjectId || !change.rawText) return [];
            const counts = eventDocumentCounts.get(changeKey({ ...change, rawText: change.rawText }))
                ?? { reportingDocuments: null, totalDocuments: null };
            return [{ text: change.rawText, ...counts }];
        });
        const unmatchedNames = decision?.unmatchedNames ?? [];
        const phraseOnly = phraseOnlySubjects.has(subjectId);
        const nameOf = (personId: string): string => getPerson(personId)?.name ?? personId;

        const empty = !decision?.voteResultPhrase && votes.length === 0 && attendance.length === 0
            && diffs.length === 0 && changes.length === 0 && issues.length === 0
            && unmatchedNames.length === 0 && !phraseOnly;
        if (empty) return null;

        return (
            <AuditEvidence
                voteResultPhrase={decision?.voteResultPhrase ?? null}
                votes={votes.map(vote => ({ name: nameOf(vote.personId), origin: vote.origin }))}
                attendance={attendance.map(row => ({ name: nameOf(row.personId), status: row.status, origin: row.origin }))}
                tallyDiffs={diffs}
                changes={changes}
                issues={issues}
                unmatchedNames={unmatchedNames}
                phraseOnly={phraseOnly}
            />
        );
    };

    /** The extraction results for a linked subject: excerpt, references, roll call, votes.
     * Shown in the view sheet's second tab. */
    const renderExtractedDetails = (subjectId: string): ReactNode => {
        const decision = decisions[subjectId];
        const extracted = extractedData[subjectId];
        const auditEvidence = renderAuditEvidence(subjectId);
        if (!decision?.excerpt && !decision?.references && !extracted && !auditEvidence) return null;
        return (
            <div className="space-y-3">
                {decision?.excerpt && (
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">{tPage('excerpt')}</div>
                        <CollapsibleMarkdown
                            content={decision.excerpt}
                            showMoreLabel={tPage('showMore')}
                            showLessLabel={tPage('showLess')}
                        />
                    </div>
                )}

                {decision?.references && (
                    <div>
                        <div className="text-xs font-medium text-muted-foreground mb-1">{tPage('references')}</div>
                        <CollapsibleMarkdown
                            content={decision.references}
                            showMoreLabel={tPage('showMore')}
                            showLessLabel={tPage('showLess')}
                        />
                    </div>
                )}

                {extracted && extracted.attendance.length > 0 && (() => {
                    const filteredAttendance = splitAttendance(extracted.attendance, mayorPersonId);
                    const presidentRow = extracted.attendance.find(a => a.personId === presidentPersonId);
                    const mayorRow = extracted.attendance.find(a => a.personId === mayorPersonId && a.personId !== presidentPersonId);
                    // splitAttendance already dropped the mayor's row; only the president stays to exclude.
                    const counted = (rows: typeof filteredAttendance.present) => rows.filter(a => a.personId !== presidentPersonId);
                    const present = sortNamesByElectedOrder(counted(filteredAttendance.present), getPerson, administrativeBodyId);
                    const absent = sortNamesByElectedOrder(counted(filteredAttendance.absent), getPerson, administrativeBodyId);
                    return (
                        <div>
                            <div className="text-xs font-medium text-muted-foreground mb-1">{tPage('attendance')}</div>
                            <div className="text-xs text-foreground space-y-1">
                                {presidentRow && <div>{tPage('presencePresident')} {presidentRow.personName}{presidentRow.status === 'ABSENT' ? ` — ${tPage('presenceAbsentMark')}` : ''}</div>}
                                {mayorRow && <div>{tPage('presenceMayor')} {mayorRow.personName}{mayorRow.status === 'ABSENT' ? ` — ${tPage('presenceAbsentMark')}` : ''}</div>}
                                <span>{present.length} {tPage('present')}, {absent.length} {tPage('absent')}</span>
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
                            <div className="text-xs font-medium text-muted-foreground mb-1">{tPage('votes')}</div>
                            <div className="text-xs text-foreground space-y-1">
                                <span>{voteResultSentence(tSubject, voteResult)}</span>
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

                {auditEvidence}

                {isSuperAdmin && (
                    <AdminStrip>
                        <AdminToolButton
                            destructive
                            disabled={resettingSubjectId === subjectId}
                            onClick={() => handleResetExtraction(subjectId)}
                        >
                            {resettingSubjectId === subjectId
                                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
                            {tPage('resetExtraction')}
                        </AdminToolButton>
                    </AdminStrip>
                )}
            </div>
        );
    };

    /** The document the sheet is showing, whether it is a linked decision or a
     * candidate nothing has placed yet — both are opened by id from the same
     * "Άνοιγμα εγγράφου" controls. */
    const view: SheetView | null = (() => {
        if (!viewing) return null;
        const candidate = candidates.find(c => c.id === viewing) ?? setAside[viewing];
        if (candidate) {
            return {
                title: candidate.title,
                decisionNumber: candidate.decisionNumber,
                pdfUrl: candidate.pdfUrl,
                ada: candidate.ada,
                subjectId: null,
                subjectName: null,
            };
        }
        const entry = Object.entries(decisions).find(([, decision]) => decision.id === viewing);
        if (!entry) return null;
        const [subjectId, decision] = entry;
        const subject = subjectById.get(subjectId);
        return {
            title: decision.title,
            decisionNumber: decisionNumberOf(decision, tPage('table.linked')),
            pdfUrl: decision.pdfUrl,
            ada: decision.ada,
            subjectId,
            subjectName: subject ? displayName(subject) : null,
        };
    })();
    // The sheet stays mounted while it animates out — same dismissable-layer
    // bug as the modal={false} note on the old row menu.
    const lastViewRef = useRef<SheetView | null>(null);
    if (view) lastViewRef.current = view;
    const sheetView = view ?? lastViewRef.current;

    return (
        // The width and the padding the other meeting pages use (see the
        // subject page): a wider container here only narrowed the table.
        <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-6">
            <div className={TWO_COLUMN_GRID}>
                <div className="min-w-0 space-y-6">
                    <div className="space-y-3 border-b pb-4">
                        {/* The title and its description are one block, so the
                            description wraps inside that block's width instead of
                            running the whole way under the search field.
                            `items-start` is what keeps the search opposite the
                            title rather than opposite the middle of the pair,
                            where it read as the answer to the description. Below
                            `sm` the search takes the full width, which wraps it
                            under the block. */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                                <h1 className="text-xl font-semibold">{tPage('title')}</h1>
                                <p className="max-w-2xl text-sm text-muted-foreground">{tPage('description')}</p>
                            </div>
                            <div className="relative w-full sm:w-72 sm:shrink-0">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    placeholder={tPage('searchSubjects')}
                                    className="h-9 w-full pl-10"
                                    value={subjectQuery}
                                    onChange={e => setSubjectQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        {minutesFailed && !minutes && (
                            <p className="text-sm text-amber-700">{tPage('minutesLoadFailed')}</p>
                        )}
                        {minutesFailed && minutes && (
                            <p className="text-sm text-amber-700">{tPage('minutesRefreshFailed')}</p>
                        )}
                    </div>

                    {!hasLoaded ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            <QuestionsCard
                                waiting={{ proposed: waiting.proposed.length, plain: waiting.plain.length }}
                                onJumpToTable={handleJumpToTable}
                                conflicts={conflicts}
                                unplaced={unplaced}
                                pickerCandidateId={pickerCandidateId}
                                renderPicker={renderPicker}
                                receipts={receipts}
                                estimate={estimate}
                                total={total}
                                loadFailed={loadFailed}
                                onRetryLoad={() => { void fetchDecisions(); }}
                                diavgeiaUid={city.diavgeiaUid}
                                pollScope={pollScope}
                                lastCheck={pollingStatus?.lastPollAt
                                    ? formatDate(new Date(pollingStatus.lastPollAt), city.timezone, locale)
                                    : null}
                                pollState={pollState}
                                onPoll={() => { void handlePoll(false); }}
                                polling={isPolling}
                                onOpenDocument={setViewing}
                                onOpenPicker={candidateId => { setPanel(null); setPickerQuery(''); setPickerCandidateId(candidateId); }}
                                onDismiss={candidateId => { void handleDismiss(candidateId); }}
                                onKeepHolder={candidateId => { void resolveConflict(candidateId, 'dismiss'); }}
                                onMoveToClaimant={candidateId => { void resolveConflict(candidateId, 'reassign'); }}
                                busyCandidateId={busyCandidateId}
                            />

                            <div ref={tableRef}>
                                <DecisionsTable
                                    rows={visibleRows}
                                    beforeAgenda={beforeAgenda}
                                    filter={effectiveFilter}
                                    missingCount={missingCount}
                                    auditCount={auditCount}
                                    onFilterChange={setFilter}
                                    openPanelSubjectId={panel?.subjectId ?? null}
                                    onOpenPanel={openPanel}
                                    renderPanel={renderPanel}
                                    onAcceptProposal={handleAccept}
                                    onRejectProposal={(subjectId, candidateId) => { void handleReject(subjectId, candidateId); }}
                                    onUndoReject={(subjectId, candidateId) => {
                                        void handleUndoReject(subjectId, candidateId, rejected[subjectId]?.receiptId ?? null);
                                    }}
                                    onOpenDecision={subjectId => setViewing(decisions[subjectId]?.id ?? null)}
                                    onOpenProposalDocument={setViewing}
                                    busySubjectId={busySubjectId}
                                    onExplainDerivation={explainDerivation}
                                />
                            </div>
                        </>
                    )}

                    {sheetView && (
                        <ConfirmSheet
                            open={view !== null}
                            onOpenChange={open => { if (!open) setViewing(null); }}
                            action="view"
                            decisionTitle={sheetView.title}
                            decisionNumber={sheetView.decisionNumber}
                            subjectName={sheetView.subjectName}
                            pdfUrl={sheetView.pdfUrl}
                            ada={sheetView.ada}
                            subjectDescription={sheetView.subjectId
                                ? subjectById.get(sheetView.subjectId)?.description ?? null
                                : null}
                            agendaItemTitle={sheetView.subjectId
                                ? subjectById.get(sheetView.subjectId)?.agendaItemTitle ?? null
                                : null}
                            busy={false}
                            extraContent={sheetView.subjectId ? renderExtractedDetails(sheetView.subjectId) : undefined}
                            onConfirm={() => undefined}
                        />
                    )}

                    {minutes && (
                        <MinutesPreviewDialog
                            open={previewOpen}
                            onOpenChange={setPreviewOpen}
                            data={minutes}
                            isSuperAdmin={isSuperAdmin}
                        />
                    )}

                    {isSuperAdmin && (
                        <DerivationDialog open={derivationOpen} onOpenChange={setDerivationOpen} />
                    )}
                </div>
                <aside className="min-w-0">
                    <DecisionsRail
                        minutes={minutes}
                        timeline={timeline}
                        isSuperAdmin={isSuperAdmin}
                        onPreviewMinutes={() => setPreviewOpen(true)}
                        onExportDocx={handleExportDocx}
                        previewDisabled={!minutes}
                        isPolling={isPolling}
                        onPollSkippingCache={() => { void handlePoll(true); }}
                        isClearing={isClearing}
                        onResetExtractions={handleClearExtractedData}
                        showResetExtractions={hasLoaded && hasExtractions}
                        issues={derivation?.issues ?? []}
                        subjectName={(subjectId: string) => {
                            const subject = subjects.find(s => s.id === subjectId);
                            return subject ? displayName(subject) : undefined;
                        }}
                        onRederive={handleRederive}
                        isRederiving={isRederiving}
                        onExplainDerivation={explainDerivation}
                        auditMode={auditMode}
                        onAuditModeChange={setAuditMode}
                        conventions={conventionsPanel}
                    />
                </aside>
            </div>
        </div>
    );
}
