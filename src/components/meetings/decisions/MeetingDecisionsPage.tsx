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
import type { AdaLookupOutcome } from '@/lib/db/types';
import { ADA_LOOKUP_SETTLE_MS } from '@/lib/db/types/adaLookups';
import { getPollingHistoryForMeeting, requestPollDecisions, resolveCandidateConflict } from '@/lib/tasks/pollDecisions';
import { pollCadence, takesNoDecisions } from '@/lib/tasks/pollDecisionsBackoff';
import { calculateVoteResult, voteCountsPhrase, voteResultSentence } from '@/lib/utils/votes';
import { formatCalendarDate, formatDate, localCalendarDate } from '@/lib/formatters/time';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { isDecisionConventions } from '@/lib/decisionConventions';
import { isRecordSubject, recordSection } from '@/lib/utils/subjects';
import { hasRecordedVote, resultKey } from '@/lib/utils/decisionResult';
import { causeFromPayload, decisionWriteCause, DecisionWriteError } from '@/lib/utils/decisionWriteCause';
import { compareAgendaPosition, normalizeText } from '@/lib/utils';
import { TWO_COLUMN_GRID } from '@/components/ui/surface-card';
import { CollapsibleMarkdown, NameList } from '@/components/meetings/decisions/shared';
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
import { AdaLookupStep, type AdaLookupState } from '@/components/meetings/decisions/AdaLookupStep';
import { readAdaLookup } from '@/lib/actions/adaLookups';
import { readDiavgeiaUnitEntries } from '@/lib/utils/diavgeiaUnitScope';
import { ConfirmSheet } from '@/components/meetings/decisions/ConfirmSheet';
import { CandidateFacts } from '@/components/meetings/decisions/CandidateFacts';
import { ManualDecisionForm, type ManualDecisionEntry } from '@/components/meetings/decisions/ManualDecisionForm';
import type { MinutesData, MinutesSubject } from '@/lib/minutes/types';
import { buildTimeline } from '@/components/meetings/decisions/timeline';
import { SubjectPresence } from '@/components/meetings/decisions/SubjectPresence';
import { buildAttendance, buildSubjectRollCall } from '@/lib/minutes/builders';
import { downloadFile } from '@/lib/export/download';
import { MinutesPreviewDialog } from '@/components/meetings/decisions/MinutesPreviewDialog';
import { DerivationDialog } from '@/components/meetings/decisions/DerivationDialog';
import { DecisionsRail } from '@/components/meetings/decisions/rail/DecisionsRail';
import type { ConventionsPanel } from '@/components/meetings/decisions/rail/ConventionsSection';
import type { SourcesPanel } from '@/components/meetings/decisions/rail/SourcesCard';
import { useMeetingFactSources } from '@/components/meetings/decisions/useMeetingFactSources';
import type { DerivationOutput } from '@/lib/derivation/types';
import { nameIssue } from '@/lib/derivation/issueText';

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
    /** The ΑΔΑ step's state. It lives on the page because the poll that answers it does. */
    lookup: AdaLookupState;
    /** A manual entry waiting in the sheet for «Αποθήκευση». */
    manual: ManualDecisionEntry | null;
    /** The last entry the form continued with, so the form refills if it remounts. */
    lastManual: ManualDecisionEntry | null;
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
    /** A candidate opened from a subject's row: the subject a link would go to. */
    target: { subjectId: string; candidate: CandidateView } | null;
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
    const { subjects, meeting, city, getPerson, people, transcript } = useCouncilMeetingData();
    // A λογοδοσία or an απολογισμός has no decisions on Diavgeia: the page offers no poll for it.
    const noDecisions = takesNoDecisions(meeting);
    const t = useTranslations('admin.adminActions');
    const tPage = useTranslations('admin.decisionsPage');
    const tSubject = useTranslations('Subject');
    const locale = useLocale();
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
    /** The document the sheet shows, and the row it was opened from — a
     * candidate opened from a row can be matched to it from the sheet. */
    const [viewing, setViewing] = useState<{ id: string; targetSubjectId: string | null } | null>(null);
    /** The other organization a looked-up document came from, by its ΑΔΑ. No
     * column holds it, and the panel's lookup state goes when the panel closes:
     * the sheet opened again later still has to warn. */
    const [lookupOrganizations, setLookupOrganizations] = useState<Record<string, string>>({});
    const openSheet = useCallback(
        (documentId: string, targetSubjectId: string | null) => setViewing({ id: documentId, targetSubjectId }),
        [],
    );
    // Bumped by handleJumpToTable; the effect below fires after the filter
    // change it triggers has committed, so it measures the table at its new
    // (post-filter) height rather than the one before the click.
    const [jumpToTableRequest, setJumpToTableRequest] = useState(0);
    /** The subject whose issues are open in a row under it, in audit mode. */
    const [openAuditSubjectId, setOpenAuditSubjectId] = useState<string | null>(null);
    // Bumped when the issues card sends the page to a subject; the effect below
    // scrolls once the row it opened has rendered.
    const [auditJumpRequest, setAuditJumpRequest] = useState(0);
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

    /** Both at once: the derived rows are what the minutes read. */
    const refetchFacts = useCallback(async () => {
        await Promise.all([fetchDecisions(), fetchMinutes()]);
    }, [fetchDecisions, fetchMinutes]);

    // The attendance sheet and the transcript as sources (issue #807). The
    // route is superadmin-only, so the hook loads nothing for anyone else.
    const factSources = useMeetingFactSources({ cityId: meeting.cityId, meetingId: meeting.id, enabled: isSuperAdmin, onFactsChanged: refetchFacts });
    // The sheet file, served by the sheet route to a superadmin; undefined until a sheet is uploaded.
    const sheetFileHref = factSources.sources?.some(s => s.source === 'sheet') ? `/api/cities/${meeting.cityId}/meetings/${meeting.id}/sheet?file=1` : undefined;
    const sourcesPanel: SourcesPanel | undefined = isSuperAdmin ? {
        sources: factSources.sources,
        loadFailed: factSources.loadFailed,
        busy: factSources.busy,
        isReading: factSources.isReading,
        failure: factSources.failure,
        timezone: city.timezone,
        fileHref: sheetFileHref,
        onUpload: (file: File) => { void factSources.upload(file); },
        onReread: () => { void factSources.reread(); },
        onRemove: () => { void factSources.remove(); },
        onReadTranscript: () => { void factSources.readTranscript(); },
    } : undefined;

    // An issue that cites an utterance links to the recording at its second,
    // the way a share link does; the transcript the page already holds says
    // which second. Hidden or absent, the transcript places nothing.
    const utteranceSeconds = useMemo(() => {
        const seconds = new Map<string, number>();
        for (const segment of transcript ?? []) {
            for (const utterance of segment.utterances) seconds.set(utterance.id, Math.floor(utterance.startTimestamp));
        }
        return seconds;
    }, [transcript]);
    const recordingHref = useCallback((utteranceId: string) => {
        const second = utteranceSeconds.get(utteranceId);
        return second === undefined ? undefined : `/${city.id}/${meeting.id}?t=${second}`;
    }, [utteranceSeconds, city.id, meeting.id]);

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

    // The poll that answers a lookup ends on another service; when the page's
    // own poll watch sees it gone, read what it found for the typed ΑΔΑ. A read
    // that finds the task still running asks again ten seconds later: the task
    // can end before the watch ever sees it, or the watch can fail to start,
    // and the step must not wait on it forever.
    const lookup = panel?.lookup;
    const panelSubjectId = panel?.subjectId ?? null;
    useEffect(() => {
        if (lookup?.kind !== 'searching' || pollingStatus?.pendingTaskId === lookup.taskId) return;
        const { ada, taskId } = lookup;
        // A later run re-reads the same task, so an outcome this run is still
        // waiting for must not land on a panel that has moved on.
        let cancelled = false;
        let retry: ReturnType<typeof setTimeout> | null = null;
        let candidateMissingSince: number | null = null;
        const read = async () => {
            const outcome = await readAdaLookup(meeting.cityId, meeting.id, taskId, ada)
                .catch((): AdaLookupOutcome => ({ state: 'failed' }));
            if (cancelled) return;
            if (outcome.state === 'running') {
                retry = setTimeout(() => { void read(); }, 10_000);
                return;
            }
            const data = outcome.state === 'found' ? await fetchDecisions() : null;
            if (cancelled) return;
            // The candidate list can be read before the poll's result handler
            // has written the candidate the outcome names: keep searching for
            // as long as the outcome read itself would.
            if (outcome.state === 'found' && outcome.candidateId !== null
                && !data?.candidates?.some(c => c.id === outcome.candidateId)) {
                candidateMissingSince ??= Date.now();
                if (Date.now() - candidateMissingSince < ADA_LOOKUP_SETTLE_MS) {
                    retry = setTimeout(() => { void read(); }, 10_000);
                    return;
                }
            }
            const next: AdaLookupState = (() => {
                switch (outcome.state) {
                    case 'notFound': return { kind: 'notFound', ada };
                    case 'error': return { kind: 'error', ada };
                    case 'notADecision': return { kind: 'notADecision', ada };
                    case 'failed': return { kind: 'failed', ada, cause: null };
                    case 'found': {
                        const holder = outcome.linkedTo;
                        if (holder) {
                            const label = holder.meetingId === meeting.id
                                ? (labelOfId(holder.subjectId) ?? ada)
                                : tPage('panel.otherMeetingSubject', {
                                    subject: holder.agendaItemIndex !== null
                                        ? tPage('subjectLabel.numbered', { n: holder.agendaItemIndex })
                                        : tPage('subjectLabel.named', { name: holder.subjectName }),
                                    meeting: holder.meetingName,
                                });
                            return { kind: 'linkedElsewhere', ada, label };
                        }
                        const candidate = data?.candidates?.find(c => c.id === outcome.candidateId);
                        if (!candidate) return { kind: 'failed', ada, cause: null };
                        const organizationLabel = outcome.organizationLabel;
                        if (organizationLabel) setLookupOrganizations(labels => ({ ...labels, [candidate.ada]: organizationLabel }));
                        return { kind: 'found', ada, candidateId: candidate.id, number: candidateNumberOf(candidate), organizationLabel: outcome.organizationLabel };
                    }
                }
            })();
            setPanel(p => p && p.lookup.kind === 'searching' && p.lookup.taskId === taskId ? { ...p, lookup: next } : p);
            if (next.kind === 'found') openSheet(next.candidateId, panelSubjectId);
        };
        void read();
        return () => {
            cancelled = true;
            if (retry !== null) clearTimeout(retry);
        };
    }, [lookup, pollingStatus?.pendingTaskId, meeting.cityId, meeting.id, fetchDecisions, labelOfId, tPage, openSheet, panelSubjectId]);

    // ─── The view model ──────────────────────────────────────────────────

    const recordSubjects = useMemo(() => subjects.filter(isRecordSubject), [subjects]);
    /** Agenda order, the order a posted Πίνακας is written in: the items taken
     * up out of the agenda first, then the agenda itself by section and number
     * — the same order the minutes preview and the DOCX print (issue 366). */
    const orderedSubjects = useMemo(() => [
        ...recordSubjects.filter(s => recordSection(s) === 'outOfAgenda'),
        ...recordSubjects.filter(s => recordSection(s) === 'agenda')
            .sort(compareAgendaPosition),
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

    /** A person's name from the city's people the page already holds, for the issues that concern one. */
    const personName = useCallback((personId: string) => getPerson(personId)?.name, [getPerson]);
    /** A subject as the table numbers it: «3. Title», or the title alone off the agenda. */
    const subjectLabel = useCallback((subjectId: string) => {
        const subject = subjects.find(s => s.id === subjectId);
        if (!subject) return undefined;
        return subject.agendaItemIndex !== null ? `${subject.agendaItemIndex}. ${displayName(subject)}` : displayName(subject);
    }, [subjects, displayName]);
    /** The derivation's issues with the ids their messages would print replaced by names, once for every surface. */
    const issues = useMemo(
        () => (derivation?.issues ?? []).map(issue => nameIssue(issue, { person: personName, subject: subjectLabel })),
        [derivation, personName, subjectLabel],
    );
    const issuesBySubject = useMemo(() => bySubject(issues), [issues]);
    const derivedVotesBySubject = useMemo(() => bySubject(derivation?.votes ?? []), [derivation]);
    const derivedAttendanceBySubject = useMemo(() => bySubject(derivation?.attendance ?? []), [derivation]);
    /** How many of the meeting's documents stated each change (`changeKey`): the
     * audit line looks the counts up here instead of `src/lib/minutes` carrying them too. */
    const eventDocumentCounts = useMemo(() => documentCountsByChange(derivation?.events ?? []), [derivation]);

    const rows: TableRow[] = orderedSubjects.map(subject => {
        const decision = decisions[subject.id];
        const votes = extractedData[subject.id]?.votes ?? [];
        const result = resultKey({ withdrawn: subject.withdrawn, hasDecision: Boolean(decision), votes });
        // A vote the sheet or the transcript states, before a document is linked,
        // says so beside the word: only when every row of the subject comes from
        // that one source, so a person's manual row never lends its label to the rest.
        const voteSources = new Set(votes.map(v => v.source));
        const only = voteSources.size === 1 ? [...voteSources][0] : null;
        const statedElsewhere = only === 'sheet' || only === 'transcript' ? only : null;
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
            resultHint: result === 'noVote' ? tPage('table.noVoteHint')
                : statedElsewhere && hasRecordedVote(result) ? tPage(`table.resultFrom.${statedElsewhere}`) : null,
            voteCounts: hasRecordedVote(result)
                ? voteCountsPhrase(tPage, calculateVoteResult(votes)) + (statedElsewhere ? ` · ${tPage(`table.sourceShort.${statedElsewhere}`)}` : '')
                : null,
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
                    votes: derivedVotesBySubject.get(subject.id) ?? [],
                    personName,
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
        noDecisions,
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

    const putDecision = async (body: {
        subjectId: string;
        pdfUrl: string;
        ada?: string;
        decisionNumber?: string | null;
        title?: string | null;
        protocolNumber?: string | null;
    }): Promise<void> => {
        const response = await fetch(`/api/cities/${meeting.cityId}/meetings/${meeting.id}/decisions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subjectId: body.subjectId,
                pdfUrl: body.pdfUrl,
                ...(body.ada ? { ada: body.ada } : {}),
                ...(body.decisionNumber ? { decisionNumber: body.decisionNumber } : {}),
                ...(body.title ? { title: body.title } : {}),
                ...(body.protocolNumber ? { protocolNumber: body.protocolNumber } : {}),
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

    /** Delete one link, then make the other: the shared body of replace, move
     * and a manual save over a linked decision. A failure closes the manual
     * sheet too, so the panel's error strip under it can be seen. */
    const replaceLink = async (args: {
        loserSubjectId: string;
        loserDecision: DecisionWithSource;
        winnerSubjectId: string;
        link: () => Promise<void>;
        onDone: () => void;
    }): Promise<void> => {
        setBusySubjectId(args.winnerSubjectId);
        setPanel(p => p && { ...p, error: null });
        try {
            await deleteDecision(args.loserSubjectId);
        } catch (error) {
            setBusySubjectId(null);
            setPanel(p => p && { ...p, confirm: null, manual: null, error: failureSentence(error) });
            return;
        }
        try {
            await args.link();
            await refreshAfterWrite(true);
            args.onDone();
        } catch (error) {
            const restored = await relinkAfterFailure(args.loserSubjectId, args.loserDecision);
            if (restored) {
                setPanel(p => p && { ...p, confirm: null, manual: null, error: failureSentence(error) });
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

    // A failed search is the step's own state, retried from the step's own
    // button: the panel's error strip and its retry belong to writes.
    const handleAdaSearch = async (subjectId: string, ada: string) => {
        setPanel(p => p && { ...p, error: null });
        try {
            const start = await requestPollDecisions(meeting.cityId, meeting.id, { lookupAdas: [ada] });
            setPanel(p => p && p.subjectId === subjectId ? {
                ...p,
                lookup: start.status === 'started' ? { kind: 'searching', ada, taskId: start.taskId } : { kind: 'blocked' },
            } : p);
            await refreshPollingStatus();
        } catch (error) {
            setPanel(p => p && p.subjectId === subjectId ? { ...p, lookup: { kind: 'failed', ada, cause: failureSentence(error) } } : p);
        }
    };

    const handleManualSave = async (subjectId: string, entry: ManualDecisionEntry) => {
        const subject = subjectById.get(subjectId);
        if (!subject) return;
        panelRetry.current = () => { void handleManualSave(subjectId, entry); };
        const afterSave = async () => {
            setPanel(null);
            addReceipt(tPage('receipts.savedManual', { number: entry.decisionNumber, subject: labelOf(subject) }));
            // The poll reads the uploaded PDF like any linked decision. A poll already
            // running reads it too if it started after the save; otherwise the next one does.
            if (noDecisions) return;
            try {
                const start = await requestPollDecisions(meeting.cityId, meeting.id);
                if (start.status === 'started') await refreshPollingStatus();
            } catch (error) {
                toast({ title: tPage('pollError'), description: failureSentence(error), variant: 'destructive' });
            }
        };
        // A PUT over a candidate-backed decision would overwrite it in place and
        // leave its candidate linked to a row that is now manual: unlink it
        // first, as a replace does. A decision no candidate backs has nothing to
        // release, and the PUT alone replaces it, so a failure leaves it there.
        const current = decisions[subjectId];
        if (current?.candidateBacked) {
            await replaceLink({
                loserSubjectId: subjectId,
                loserDecision: current,
                winnerSubjectId: subjectId,
                link: () => putDecision({ subjectId, ...entry }),
                onDone: () => { void afterSave(); },
            });
            return;
        }
        const ok = await runWrite({ subjectId, inPanel: true, changesDecision: true }, () => putDecision({ subjectId, ...entry }));
        // The failure and its retry are in the panel, under the sheet.
        if (!ok) {
            setPanel(p => p && { ...p, manual: null });
            return;
        }
        await afterSave();
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
            { label: number, onOpen: () => openSheet(candidateId, null) },
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

    const toggleAuditSubject = useCallback((subjectId: string) => {
        setOpenAuditSubjectId(open => (open === subjectId ? null : subjectId));
    }, []);

    /**
     * From the issues card to a subject: its issues open under its row, and the
     * row comes into view. The card shows whether or not audit mode is on, and
     * the row exists only under it, so the jump turns the mode on. A search or
     * the missing filter could hide the row, so both give way.
     */
    const selectIssueSubject = (subjectId: string) => {
        if (!auditModePreference) setAuditMode(true);
        setSubjectQuery('');
        if (filter === 'missing') setFilter('all');
        setOpenAuditSubjectId(subjectId);
        setAuditJumpRequest(request => request + 1);
    };

    useEffect(() => {
        if (auditJumpRequest === 0 || !openAuditSubjectId) return;
        const row = Array.from(tableRef.current?.querySelectorAll<HTMLElement>('[data-subject-id]') ?? [])
            .find(element => element.dataset.subjectId === openAuditSubjectId);
        if (row) scrollElementToContainerTop(row, JUMP_TO_TABLE_MARGIN_PX);
    }, [auditJumpRequest, openAuditSubjectId]);

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
            const start = await requestPollDecisions(meeting.cityId, meeting.id, forceExtract ? { forceExtract: true } : undefined);
            if (start.status === 'alreadyRunning') toast({ title: tPage('poll.alreadyRunning') });
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
        setPanel({ subjectId, mode, query: '', confirm: null, error: null, lookup: { kind: 'idle' }, manual: null, lastManual: null });
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
            link: () => postAction({ action: 'assignCandidate', candidateId: confirm.candidateId, subjectId }),
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
        // `blocked` is only a poll someone else started: it clears itself the
        // moment that poll ends, since nothing here stored it.
        const lookupState: AdaLookupState = panel.lookup.kind === 'idle' || panel.lookup.kind === 'blocked'
            ? (pollingStatus?.pendingTaskId ? { kind: 'blocked' } : { kind: 'idle' })
            : panel.lookup;
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
                offerableCount={rowCandidates({ subjectId, candidates, subjectByCandidate, subjects: panelSubjects, query: '' }).length}
                renderAdaStep={noDecisions ? null : ({ noCandidates, onBack, onManual, onClose }) => (
                    <AdaLookupStep
                        subjectLabel={labelOf(subject)}
                        noCandidates={noCandidates}
                        state={lookupState}
                        onSearch={ada => { void handleAdaSearch(subjectId, ada); }}
                        onOpenFound={candidateId => openSheet(candidateId, subjectId)}
                        onManual={onManual}
                        onBack={onBack}
                        onClose={onClose}
                    />
                )}
                renderManualStep={({ onBack, toAda, onClose }) => (
                    <ManualDecisionForm
                        subjectLabel={labelOf(subject)}
                        uploadConfig={{ cityId: meeting.cityId, identifier: `${meeting.id}_${subjectId}`, suffix: 'decision' }}
                        initial={panel.lastManual}
                        onContinue={entry => setPanel(p => p && { ...p, manual: entry, lastManual: entry })}
                        onUseAda={noDecisions ? undefined : ada => { toAda(); void handleAdaSearch(subjectId, ada); }}
                        onBack={onBack}
                        onClose={onClose}
                    />
                )}
                onOpenDocument={documentId => openSheet(documentId, subjectId)}
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
        const nameOf = (personId: string): string => personName(personId) ?? personId;

        const empty = !decision?.voteResultPhrase && votes.length === 0 && attendance.length === 0
            && diffs.length === 0 && changes.length === 0 && issues.length === 0
            && unmatchedNames.length === 0;
        if (empty) return null;

        return (
            <AuditEvidence
                voteResultPhrase={decision?.voteResultPhrase ?? null}
                votes={votes.map(vote => ({ name: nameOf(vote.personId), origin: vote.origin }))}
                attendance={attendance.map(row => ({ name: nameOf(row.personId), status: row.status, origin: row.origin }))}
                tallyDiffs={diffs}
                changes={changes}
                issues={issues}
                personName={personName}
                unmatchedNames={unmatchedNames}
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
        // The subject's presence from one snapshot: the minutes' subject, whose
        // attendance gives both the absentees and the people the roll call does
        // not name. When the minutes did not load, the decisions request's own
        // rows, with no ΔΗΜΑΡΧΟΣ or ΠΡΟΕΔΡΟΣ line.
        const minutesSubject = minutesById.get(subjectId);
        const subjectRollCall = minutes?.councilComposition && minutesSubject?.attendance
            ? buildSubjectRollCall(minutes.councilComposition, minutesSubject.attendance, minutes.administrativeBody?.type ?? null, minutesSubject.presidedBy)
            : extracted && extracted.attendance.length > 0
                ? buildSubjectRollCall(null, buildAttendance(extracted.attendance, null, (personId, name) => ({ personId, name, party: null, isPartyHead: false, role: null }), () => null), null, null)
                : null;
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

                {subjectRollCall && <SubjectPresence rollCall={subjectRollCall} />}

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
                                {/* A ΠΑΡΩΝ or ΑΠΟΧΗ declaration is not a vote, so a unanimous vote can still hold one. */}
                                {(voteResult.presentCount > 0 || voteResult.didNotVoteCount > 0) && (
                                    <div className="flex flex-col gap-1">
                                        <NameList
                                            names={extracted.votes.filter(v => v.voteType === 'PRESENT').map(v => v.personName)}
                                            label={`${tSubject('votePresent')} (${voteResult.presentCount})`}
                                        />
                                        <NameList
                                            names={extracted.votes.filter(v => v.voteType === 'DID_NOT_VOTE').map(v => v.personName)}
                                            label={`${tSubject('voteDidNotVote')} (${voteResult.didNotVoteCount})`}
                                        />
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
        const live = candidates.find(c => c.id === viewing.id);
        const candidate = live ?? setAside[viewing.id];
        if (candidate) {
            return {
                title: candidate.title,
                decisionNumber: candidate.decisionNumber,
                pdfUrl: candidate.pdfUrl,
                ada: candidate.ada,
                subjectId: null,
                subjectName: null,
                // A candidate set aside is no longer offered, so it opens to be read only.
                target: live && viewing.targetSubjectId ? { subjectId: viewing.targetSubjectId, candidate: live } : null,
            };
        }
        const entry = Object.entries(decisions).find(([, decision]) => decision.id === viewing.id);
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
            target: null,
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
                                onOpenDocument={documentId => openSheet(documentId, null)}
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
                                    onOpenDecision={subjectId => {
                                        const decisionId = decisions[subjectId]?.id;
                                        if (decisionId) openSheet(decisionId, null);
                                    }}
                                    onOpenProposalDocument={openSheet}
                                    busySubjectId={busySubjectId}
                                    openAuditSubjectId={openAuditSubjectId}
                                    onToggleAudit={toggleAuditSubject}
                                    onExplainDerivation={explainDerivation}
                                    evidenceLinks={{ recordingHref, sheetHref: sheetFileHref }}
                                />
                            </div>
                        </>
                    )}

                    {sheetView && (() => {
                        const target = sheetView.target;
                        const subjectId = target?.subjectId ?? sheetView.subjectId;
                        const subject = subjectId ? subjectById.get(subjectId) : undefined;
                        const holder = target ? subjectByCandidate.get(target.candidate.id) : undefined;
                        const movesFromElsewhere = Boolean(target && holder && holder !== target.subjectId && decisions[holder]);
                        return (
                            <ConfirmSheet
                                open={view !== null}
                                onOpenChange={open => { if (!open) setViewing(null); }}
                                action={target ? 'assign' : 'view'}
                                decisionTitle={sheetView.title}
                                decisionNumber={sheetView.decisionNumber}
                                // `assignExplain` contracts «σε» with the label's article; `viewExplain` quotes the bare name.
                                subjectName={target ? (subject ? labelOf(subject) : null) : sheetView.subjectName}
                                pdfUrl={sheetView.pdfUrl}
                                ada={sheetView.ada}
                                subjectDescription={subject?.description ?? null}
                                agendaItemTitle={subject?.agendaItemTitle ?? null}
                                meetingId={meeting.id}
                                cityId={meeting.cityId}
                                busy={target ? busySubjectId === target.subjectId || busyCandidateId === target.candidate.id : false}
                                sourceNote={tPage('sheet.notOnDiavgeia')}
                                confirmLabel={movesFromElsewhere ? tPage('sheet.moveAction') : tPage('sheet.assignAction')}
                                facts={target ? (
                                    <CandidateFacts
                                        publishDate={target.candidate.publishDate}
                                        declaredDate={target.candidate.meetingDate?.slice(0, 10) ?? null}
                                        meetingDate={localCalendarDate(new Date(meeting.dateTime), city.timezone)}
                                        readStatus={target.candidate.readStatus}
                                        organizationLabel={lookupOrganizations[target.candidate.ada] ?? null}
                                        proposal={target.candidate.subjectId === target.subjectId
                                            ? { confidence: target.candidate.confidence, reasoning: target.candidate.reasoning }
                                            : null}
                                    />
                                ) : undefined}
                                extraContent={!target && sheetView.subjectId ? renderExtractedDetails(sheetView.subjectId) : undefined}
                                onConfirm={() => {
                                    if (!target) return;
                                    setViewing(null);
                                    // The write reports a failure, and asks a move or a replace, in the
                                    // row's panel — so the panel has to be open on that row first.
                                    if (panel?.subjectId !== target.subjectId) {
                                        openPanel(target.subjectId, decisions[target.subjectId] ? 'change' : 'link');
                                    }
                                    if (movesFromElsewhere && holder) {
                                        setPanel(p => p && { ...p, confirm: { kind: 'move', candidateId: target.candidate.id, from: labelOfId(holder) ?? '' } });
                                    } else {
                                        handlePanelPick(target.subjectId, target.candidate.id);
                                    }
                                }}
                                onDismiss={target ? () => { setViewing(null); void handleDismiss(target.candidate.id); } : undefined}
                            />
                        );
                    })()}

                    {panel?.manual && (() => {
                        const subject = subjectById.get(panel.subjectId);
                        const entry = panel.manual;
                        const replaced = decisions[panel.subjectId];
                        return (
                            <ConfirmSheet
                                open
                                onOpenChange={open => { if (!open) setPanel(p => p && { ...p, manual: null }); }}
                                action="link"
                                decisionTitle={entry.title}
                                decisionNumber={entry.decisionNumber}
                                subjectName={subject ? labelOf(subject) : null}
                                pdfUrl={entry.pdfUrl}
                                ada={null}
                                sourceNote={tPage('sheet.notOnDiavgeia')}
                                subjectDescription={subject?.description ?? null}
                                agendaItemTitle={subject?.agendaItemTitle ?? null}
                                meetingId={meeting.id}
                                cityId={meeting.cityId}
                                busy={busySubjectId === panel.subjectId}
                                confirmLabel={tPage('sheet.saveAction')}
                                explainNote={replaced
                                    ? tPage(replaced.candidateBacked ? 'panel.replaceNote' : 'panel.replaceNoteDestructive', {
                                        number: decisionNumberOf(replaced, tPage('table.linked')),
                                    })
                                    : undefined}
                                onConfirm={() => { void handleManualSave(panel.subjectId, entry); }}
                            />
                        );
                    })()}

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
                        onPollSkippingCache={noDecisions ? null : () => { void handlePoll(true); }}
                        isClearing={isClearing}
                        onResetExtractions={handleClearExtractedData}
                        showResetExtractions={hasLoaded && hasExtractions}
                        issues={issues}
                        subjectName={subjectLabel}
                        personName={personName}
                        subjectOrder={orderedSubjects.map(subject => subject.id)}
                        openIssueSubjectId={openAuditSubjectId}
                        onSelectIssueSubject={selectIssueSubject}
                        onRederive={handleRederive}
                        isRederiving={isRederiving}
                        onExplainDerivation={explainDerivation}
                        auditMode={auditMode}
                        onAuditModeChange={setAuditMode}
                        conventions={conventionsPanel}
                        factSources={sourcesPanel}
                        recordingHref={recordingHref}
                        sheetHref={sheetFileHref}
                    />
                </aside>
            </div>
        </div>
    );
}
