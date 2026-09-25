import { replayAttendance } from './replayAttendance';
import { deriveVotes } from './deriveVotes';
import { resolveSession } from './resolveSession';
import { isConfirmedByPerson, type DecisionConventions } from '@/lib/decisionConventions';
import type { DocumentFacts, DerivationInput, DerivationOutput, Issue, OrderedSubject } from './types';

/**
 * Where one document and what we hold about it part company: the layout it
 * printed against the body's profiled one, and the item it says it decided
 * against the subject it is linked to.
 *
 * Neither disagreement changes a derived row — both say the reading may be
 * standing on the wrong ground, which is why they are reported rather than acted
 * on. A body profiled as `mixed` states that its documents vary, so no single
 * layout contradicts it.
 */
function documentDisagreements(doc: DocumentFacts, subject: OrderedSubject | undefined, conventions: DecisionConventions | null): Issue[] {
    const issues: Issue[] = [];
    const where = { subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision' } as const;
    const expected = conventions?.rollCallLayout;
    if (expected && expected !== 'mixed' && doc.rollCallLayout && doc.rollCallLayout !== expected) {
        issues.push({ code: 'LAYOUT_DISAGREES', ...where, params: { expected, found: doc.rollCallLayout } });
    }
    // Only where both sides name an agenda item. An out-of-agenda subject carries
    // no agendaItemIndex and the number such a document declares counts its
    // position among the out-of-agenda items, so comparing the two numbers there
    // compares different things and every out-of-agenda subject reads as an error.
    if (subject?.agendaItemIndex != null && doc.declaredItemNumber != null
        && doc.declaredOutOfAgenda === false && subject.nonAgendaReason !== 'outOfAgenda'
        && doc.declaredItemNumber !== subject.agendaItemIndex) {
        issues.push({ code: 'ITEM_NUMBER_DISAGREES', ...where, params: { declared: doc.declaredItemNumber, linked: subject.agendaItemIndex } });
    }
    return issues;
}

/**
 * One derivation over stored rows: the roll call and the events resolved over
 * every page, attendance replayed (or stated) per subject, vote rows per
 * document, and every gap as an issue. Pure and deterministic.
 */
export function deriveMeetingFacts(input: DerivationInput): DerivationOutput {
    const issues: Issue[] = [];
    if (input.conventions && !isConfirmedByPerson(input.conventions)) {
        issues.push({ code: 'CONVENTIONS_UNCONFIRMED', source: null, params: {} });
    }
    const session = resolveSession(input);
    issues.push(...session.issues);
    // The pages' own roll call and events join what other sources state; the replay
    // ranks the two with SOURCE_PRECEDENCE, so a manual row still wins.
    const replay = replayAttendance({ ...input, rollCall: [...session.rollCall, ...input.rollCall], events: [...session.events, ...input.events], rollCallMissing: session.missing });
    issues.push(...replay.issues);

    const votes: DerivationOutput['votes'] = [];
    const presiding = new Map<string, string | null>();
    const subjectById = new Map(input.subjects.map(s => [s.id, s]));
    for (const doc of input.documents) {
        // Nothing of an unread document is derived: its phrase alone, with no named
        // dissenter to go with it, would make every contested decision unanimous.
        if (!doc.hasExtraction) {
            issues.push({ code: 'UNREAD_DOCUMENT', subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision', params: {} });
            continue;
        }
        const present = replay.presentBySubject.get(doc.subjectId) ?? null;
        issues.push(...documentDisagreements(doc, subjectById.get(doc.subjectId), input.conventions));
        const r = deriveVotes(doc, present, input.mayorPersonId);
        votes.push(...r.votes); issues.push(...r.issues);
        for (const name of doc.unmatchedNames) issues.push({ code: 'UNMATCHED_NAME', subjectId: doc.subjectId, decisionId: doc.decisionId,
            source: 'decision', rawText: name, params: { name } });
        if (doc.incomplete) issues.push({ code: 'INCOMPLETE_READ', subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision',
            params: {} });
        if (doc.presidedById || doc.presidedByName) presiding.set(doc.decisionId, doc.presidedById ?? doc.presidedByName);
    }
    const presidingValues = new Set(presiding.values());
    if (presidingValues.size > 1) issues.push({ code: 'PRESIDING_DISAGREES', source: 'decision',
        params: { names: [...presidingValues].join(', ') } });

    return { attendance: replay.attendance, votes, issues, phraseOnlySubjectIds: replay.unknownSubjectIds, rollCall: session.rollCall, events: session.events };
}
