import { replayAttendance } from './replayAttendance';
import { deriveVotes, phraseOutcome, phrasePermitsInference } from './deriveVotes';
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
function documentDisagreements(
    doc: DocumentFacts, subject: OrderedSubject | undefined, conventions: DecisionConventions | null, cityMayorPersonId: string | null,
    present: ReadonlySet<string> | null,
): Issue[] {
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
    // How the body names its voters, against how this page did. A mismatch is a
    // misread or a wrong convention; the vote rows stay as deriveVotes makes them.
    // The mayor's own FOR is excluded by the city's mayor, not `mayorPersonId`
    // (null wherever the mayor sits as a member): a mayor written apart from the
    // members (§6.5) is not "the page named a member FOR" on any body, committee
    // included — replayAttendance's `mayorWrittenApart` reads the same field.
    const expectedVoters = conventions?.namedVoters;
    const named = doc.namedVotes.filter(v => v.personId !== cityMayorPersonId);
    const namesFor = named.some(v => v.vote === 'FOR');
    // A unanimous page that names every member present on the subject, all with
    // one vote, named every voter, whatever that vote: Athens 4η 9ΖΘΨΩ6Μ-Θ0Ζ names
    // nine members ΚΑΤΑ and then «ΑΠΟΦΑΣΙΖΕΙ ΟΜΟΦΩΝΑ Δεν εγκρίνει», a unanimous
    // rejection with nobody FOR. A page that names only some of them has lost the
    // FOR names, and with no presence known nothing shows that it named everyone.
    const namedIds = new Set(named.map(v => v.personId));
    const namesEveryonePresent = present !== null && [...present].every(personId => personId === cityMayorPersonId || namedIds.has(personId));
    const unanimousOneVote = named.length > 0 && namesEveryonePresent && phraseOutcome(doc.voteResultPhrase) === 'unanimous'
        && new Set(named.map(v => v.vote)).size === 1;
    const namesNobodyFor = !namesFor && phrasePermitsInference(doc.voteResultPhrase) && !unanimousOneVote;
    // A body that names voters only on a split vote names nobody under «Ομόφωνα»,
    // and everyone under «κατά πλειοψηφία». A phrase that names neither outcome
    // does not say which of the two the page should have done.
    const unlikeBody = expectedVoters === 'dissenters_only' ? namesFor
        : expectedVoters === 'none' ? named.length > 0
        : expectedVoters === 'all' ? namesNobodyFor
        : expectedVoters === 'all_when_split' ? (named.length === 0 ? phraseOutcome(doc.voteResultPhrase) === 'majority' : namesNobodyFor)
        : false;
    if (expectedVoters && unlikeBody) issues.push({ code: 'NAMED_VOTERS_UNEXPECTED', ...where, params: { expected: expectedVoters } });
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
        const absent = replay.absentBySubject.get(doc.subjectId) ?? null;
        issues.push(...documentDisagreements(doc, subjectById.get(doc.subjectId), input.conventions, input.cityMayorPersonId, present));
        const r = deriveVotes(doc, present, input.mayorPersonId, absent);
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
