/**
 * The shape `decisions trace` prints: how one meeting's facts went from the
 * stored page readings through the resolver and the derivation to the rows
 * and the issues. A validation page draws one flow diagram per meeting from
 * this JSON, so its field names are fixed (see the task brief).
 *
 * `buildMeetingTrace` is pure: it only reads `input` (the production loader's
 * output), `output` (the production derivation's output) and `meta` (display
 * data the derivation itself never needs — names, ada, urls, the commit). It
 * calls the resolver itself for the roll-call and events breakdown, since a
 * refused meeting's `output` carries none of that (persist.ts empties it),
 * and the trace explains the pages regardless of whether the write may run.
 */
import { pagesCarryOwnList, resolveSession } from '@/lib/derivation/resolveSession';
import { rankRollCall } from '@/lib/derivation/replayAttendance';
import { derivationSkipIssue } from '@/lib/derivation/persist';
import { issuePerson } from '@/lib/derivation/issueText';
import { issueMessageEn } from '@/lib/derivation/issueTextEn';
import { ISSUE_SEVERITY, ISSUE_STAGES } from '@/lib/derivation/issueCatalogue';
import type { DerivationInput, DerivationOutput, DerivedVoteRow, EventRow } from '@/lib/derivation/types';

export interface MeetingTraceMeta {
    /** `git rev-parse --short HEAD`, computed once by the caller. */
    commit: string;
    meeting: { name: string; date: string; body: { name: string; type: string } | null };
    /** ada, pdfUrl and the raw extractorVersion string of the subject's decision, by subjectId; absent for a subject with no decision. */
    decisions: Record<string, { ada: string | null; url: string | null; version: string | null }>;
    /** Every person's name the trace may need to print, by id. */
    personNames: Record<string, string>;
}

export interface MeetingTrace {
    meeting: {
        cityId: string; meetingId: string; name: string; date: string; body: { name: string; type: string } | null;
        conventions: {
            presentListMeaning: string; statesPerDecisionAttendance: boolean; statesPerVoteAbsence: boolean;
            attendanceChangeAnchors: string[]; confirmedBy: string | null;
        } | null;
    };
    commit: string;
    refused: string | null;
    pages: Array<{
        ada: string | null; url: string | null; subjectId: string; item: number | null; nonAgenda: boolean;
        decisionNumber: string | null; version: string | null; usable: boolean;
        rollCall: { layout: string | null; present: number; absent: number; matchedPresent: number; matchedAbsent: number } | null;
        ownList: number | null;
        statedChanges: number;
        perVoteAbsences: number;
        nameMatches: { token: number; llm: number; unmatched: number } | null;
        unmatchedNames: string[];
    }>;
    resolve: {
        rollCall: {
            rule: 'majority' | 'first-page' | 'stated' | 'none'; pagesAgreeing: number; pagesWithRollCall: number;
            missing: string | null; present: number; absent: number;
        };
        events: {
            rule: 'every-stated' | 'majority'; kept: number; dropped: number;
            list: Array<{ person: string; kind: string; anchor: string; timing: string | null; reporting: number; total: number; source: string }>;
        };
    };
    rows: {
        attendance: number; votes: number;
        bySubject: Array<{ subjectId: string; item: number | null; name: string; present: number; absent: number; votes: Record<string, number> }>;
    };
    issues: Array<{ code: string; stage: string; severity: string; subjectId: string | null; person: string | null; message: string }>;
}

/** A short label for where a stated change is pinned, for display only. */
function describeAnchor(e: EventRow): string {
    switch (e.anchorKind) {
        case 'AGENDA_ITEM': return e.anchorNonAgendaReason ? `out of agenda (${e.anchorNonAgendaReason})` : `item ${e.anchorAgendaItemIndex}`;
        case 'DECISION_NUMBER': return `decision ${e.anchorDecisionNumber}`;
        case 'PHASE': return `phase ${e.anchorPhase}`;
        case 'SUBJECT': return `subject ${e.anchorSubjectId}`;
        default: return e.anchorKind;
    }
}

function voteTally(votes: DerivedVoteRow[]): Record<string, number> {
    const tally: Record<string, number> = {};
    for (const v of votes) tally[v.voteType] = (tally[v.voteType] ?? 0) + 1;
    return tally;
}

export function buildMeetingTrace(input: DerivationInput, output: DerivationOutput, meta: MeetingTraceMeta): MeetingTrace {
    const personOf = (id: string) => meta.personNames[id] ?? id;
    const skip = derivationSkipIssue(input);
    // The resolver's own view of the pages, independent of the write guard: a
    // refused meeting's `output` carries no roll call or events (persist.ts
    // empties it), but the trace explains what the pages state regardless.
    const session = resolveSession(input);
    const usablePages = input.documents.filter(d => d.hasExtraction);

    const subjectById = new Map(input.subjects.map(s => [s.id, s]));
    const pages: MeetingTrace['pages'] = input.documents.map(doc => {
        const subject = subjectById.get(doc.subjectId);
        const decisionMeta = meta.decisions[doc.subjectId] ?? null;
        const printedPresent = doc.lists.rollCallPresent.length;
        const printedAbsent = doc.lists.rollCallAbsent.length;
        return {
            ada: decisionMeta?.ada ?? null,
            url: decisionMeta?.url ?? null,
            subjectId: doc.subjectId,
            item: subject?.agendaItemIndex ?? null,
            nonAgenda: subject?.nonAgendaReason != null,
            decisionNumber: subject?.decisionNumber ?? null,
            version: decisionMeta?.version ?? null,
            usable: doc.hasExtraction,
            rollCall: printedPresent + printedAbsent > 0 ? {
                layout: doc.rollCallLayout,
                present: printedPresent,
                absent: printedAbsent,
                matchedPresent: doc.rollCallPresentIds?.length ?? 0,
                matchedAbsent: doc.rollCallAbsentIds?.length ?? 0,
            } : null,
            ownList: doc.presentIds?.length ?? null,
            statedChanges: doc.statedChanges.length,
            perVoteAbsences: doc.perVoteAbsences.length,
            nameMatches: doc.nameMatches ? {
                token: doc.nameMatches.filter(m => m.method === 'token').length,
                llm: doc.nameMatches.filter(m => m.method === 'llm').length,
                unmatched: doc.nameMatches.filter(m => m.method === null).length,
            } : null,
            unmatchedNames: doc.unmatchedNames,
        };
    });

    // spec: stated when manual/transcript rows set the roll call; first-page
    // for a per_decision body; majority otherwise; none when the pages settle
    // nothing and nothing else states one either. The label names which rule
    // set the roll call; `session.rollCallBasis.strategy` is the resolver's
    // own record of which of first-page/majority it ran, so the label does not
    // copy its internal condition.
    const rollCallRule: MeetingTrace['resolve']['rollCall']['rule'] =
        input.rollCall.length > 0 ? 'stated'
            : session.rollCall.length === 0 ? 'none'
                : session.rollCallBasis.strategy;
    // Production never picks one source wholesale (deriveMeetingFacts,
    // measureMeeting): the pages' resolved roll call and whatever a manual or
    // transcript source states are merged and ranked by source, so a manual
    // row only overrides the person it names. The counts here follow suit.
    const mergedRollCall = [...rankRollCall([...session.rollCall, ...input.rollCall]).rows.values()];

    const eventsRule: MeetingTrace['resolve']['events']['rule'] = pagesCarryOwnList(input.conventions, usablePages) ? 'every-stated' : 'majority';
    const dropped = session.issues.filter(i => i.code === 'CHANGE_NOT_CORROBORATED').length;

    const issues: MeetingTrace['issues'] = output.issues.map(issue => ({
        code: issue.code,
        stage: ISSUE_STAGES[issue.code].join('/'),
        severity: ISSUE_SEVERITY[issue.code],
        subjectId: issue.subjectId ?? null,
        person: issuePerson(issue, personOf)?.name ?? null,
        message: issueMessageEn(issue),
    }));

    return {
        meeting: {
            cityId: input.cityId, meetingId: input.meetingId, name: meta.meeting.name, date: meta.meeting.date, body: meta.meeting.body,
            conventions: input.conventions ? {
                presentListMeaning: input.conventions.presentListMeaning,
                statesPerDecisionAttendance: input.conventions.statesPerDecisionAttendance,
                statesPerVoteAbsence: input.conventions.statesPerVoteAbsence,
                attendanceChangeAnchors: input.conventions.attendanceChangeAnchors,
                confirmedBy: input.conventions.provenance.confirmedBy ?? null,
            } : null,
        },
        commit: meta.commit,
        refused: skip?.code ?? null,
        pages,
        resolve: {
            rollCall: {
                rule: rollCallRule,
                pagesAgreeing: session.rollCallBasis.pagesAgreeing,
                pagesWithRollCall: session.rollCallBasis.pagesWithRollCall,
                missing: session.missing,
                present: mergedRollCall.filter(r => r.status === 'PRESENT').length,
                absent: mergedRollCall.filter(r => r.status === 'ABSENT').length,
            },
            events: {
                rule: eventsRule,
                kept: session.events.length,
                dropped,
                list: session.events.map(e => ({
                    person: personOf(e.personId), kind: e.kind, anchor: describeAnchor(e), timing: e.timing ?? null,
                    reporting: e.reportingDocuments, total: e.totalDocuments, source: e.source,
                })),
            },
        },
        rows: {
            attendance: output.attendance.length,
            votes: output.votes.length,
            bySubject: input.subjects.map(s => {
                const attendance = output.attendance.filter(a => a.subjectId === s.id);
                const votes = output.votes.filter(v => v.subjectId === s.id);
                return {
                    subjectId: s.id, item: s.agendaItemIndex, name: s.name,
                    present: attendance.filter(a => a.status === 'PRESENT').length,
                    absent: attendance.filter(a => a.status === 'ABSENT').length,
                    votes: voteTally(votes),
                };
            }),
        },
        issues,
    };
}
