import { rankRollCall, replayAttendance } from './replayAttendance';
import type { DataSource } from '@prisma/client';
import { compareVoteStatements, deriveVotes, expandPartyVotes, mergeStatements, phraseOutcome, phrasePermitsInference } from './deriveVotes';
import { resolveSession } from './resolveSession';
import { rankEvents } from './rankSources';
import { isConfirmedByPerson, type DecisionConventions } from '@/lib/decisionConventions';
import { sourceRank } from './types';
import type { DocumentFacts, DerivationInput, DerivationOutput, EventRow, Issue, OrderedSubject, PresidingStatement, VoteFacts } from './types';

/**
 * Where one document and what we hold about it part company: the layout it
 * printed against the body's recorded one, and the item it says it decided
 * against the subject it is linked to.
 *
 * Neither disagreement changes a derived row — both say the reading may be
 * standing on the wrong ground, which is why they are reported rather than acted
 * on. A body recorded as `mixed` states that its documents vary, so no single
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
    // members is not "the page named a member FOR" on any body, committee
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

/** A page's vote statement, as `deriveVotes` reads every source's. */
export function voteFactsOfDocument(doc: DocumentFacts): VoteFacts {
    return {
        subjectId: doc.subjectId, source: 'decision', decisionId: doc.decisionId,
        voteResultPhrase: doc.voteResultPhrase, statedOutcome: null,
        namedVotes: doc.namedVotes, partyVotes: [], tally: doc.tally,
        rawText: doc.voteResultPhrase,
    };
}

/**
 * One derivation over stored rows: the roll call and the events resolved over
 * every page and every other source, attendance replayed (or stated) per
 * subject, vote rows per subject from the highest-precedence source that
 * states one, and every gap or disagreement as an issue. Pure and deterministic.
 */
export function deriveMeetingFacts(input: DerivationInput): DerivationOutput {
    const issues: Issue[] = [];
    if (input.conventions && !isConfirmedByPerson(input.conventions)) {
        issues.push({ code: 'CONVENTIONS_UNCONFIRMED', source: null, params: {} });
    }
    const session = resolveSession(input);
    issues.push(...session.issues);

    // The pages' own roll call and events join what the other sources state; the
    // replay ranks the roll call with SOURCE_PRECEDENCE, and rankEvents ranks the
    // changes per person, so a manual row still wins and a sheet outranks a page's
    // rival only where a page states nothing.
    const sourceRollCall = input.sources.flatMap(s => s.rollCall ?? []);
    const rollCall = [...session.rollCall, ...sourceRollCall, ...input.rollCall];
    const sourceEvents: EventRow[] = input.sources.flatMap(s => s.statedChanges.map((c, i) => ({
        ...c, id: `${input.cityId}:${input.meetingId}:${s.source}:ev${String(i).padStart(4, '0')}`, reportingDocuments: 1, totalDocuments: 1, source: s.source,
    })));
    const ranked = rankEvents(input.subjects, [...session.events, ...sourceEvents, ...input.events]);
    issues.push(...ranked.issues);
    // The reference source of the meeting, for a row a manual statement decided:
    // the pages where one is read, else the highest-ranked source that states anything.
    const rowSourceForManual = input.documents.some(d => d.hasExtraction) ? 'decision'
        : [...input.sources].sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0]?.source ?? 'decision';
    const replay = replayAttendance({ ...input, rollCall, events: ranked.events, rowSourceForManual });
    issues.push(...replay.issues);

    // Every source's vote statements, per subject; the pages first, in the order
    // of the subjects, then the other sources.
    const statements = new Map<string, VoteFacts[]>();
    const state = (facts: VoteFacts) => statements.set(facts.subjectId, [...(statements.get(facts.subjectId) ?? []), facts]);
    const presiding = new Map<string, PresidingStatement>();
    const subjectById = new Map(input.subjects.map(s => [s.id, s]));
    for (const doc of input.documents) {
        // Nothing of an unread document is derived: its phrase alone, with no named
        // dissenter to go with it, would make every contested decision unanimous.
        if (!doc.hasExtraction) {
            issues.push({ code: 'UNREAD_DOCUMENT', subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision', params: {} });
            continue;
        }
        const present = replay.presentBySubject.get(doc.subjectId) ?? null;
        issues.push(...documentDisagreements(doc, subjectById.get(doc.subjectId), input.conventions, input.cityMayorPersonId, present));
        state(voteFactsOfDocument(doc));
        for (const name of doc.unmatchedNames) issues.push({ code: 'UNMATCHED_NAME', subjectId: doc.subjectId, decisionId: doc.decisionId,
            source: 'decision', rawText: name, params: { name } });
        if (doc.incomplete) issues.push({ code: 'INCOMPLETE_READ', subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision',
            params: {} });
        // A read that reached ΑΠΟΦΑΣΙΖΕΙ and lost the vote after it (sparta Ψ2Φ7Ω1Ν-Ι00). A page
        // that does not say ΑΠΟΦΑΣΙΖΕΙ may have no vote at all: a mayor's decision linked to
        // the subject, an announcement. On c1sample the condition finds 3 of 592 pages, all misreads.
        else if (doc.statesBodyDecision && !doc.voteResultPhrase?.trim() && doc.namedVotes.length === 0
            && !Object.values(doc.tally ?? {}).some(n => n != null)) {
            issues.push({ code: 'NO_VOTE_RESULT', subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision', params: {} });
        }
        if (doc.closingBlockCut) issues.push({ code: 'CLOSING_BLOCK_CUT', subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision', params: {} });
        if (doc.closingReadFailed) issues.push({ code: 'CLOSING_READ_FAILED', subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision', params: {} });
        const who = doc.presidedById ?? doc.presidedByName;
        if (who && !presiding.has(who)) presiding.set(who, { personId: doc.presidedById, name: doc.presidedByName });
    }
    for (const src of input.sources) {
        for (const facts of src.votes) if (subjectById.has(facts.subjectId)) state(facts);
        for (const u of src.unplacedVotes) issues.push({ code: 'UNPLACEABLE_VOTE', source: src.source, rawText: u.rawText, evidence: u.evidence, params: {} });
        for (const name of src.unmatchedNames) issues.push({ code: 'UNMATCHED_NAME', source: src.source, rawText: name, params: { name } });
        const who = src.presidedById ?? src.presidedByName;
        if (who && !presiding.has(who)) presiding.set(who, { personId: src.presidedById, name: src.presidedByName });
    }
    if (presiding.size > 1) issues.push({ code: 'PRESIDING_DISAGREES', source: 'decision', params: { presiding: [...presiding.values()] } });

    // Who decided each person's presence at each subject: an inferred vote rests
    // on that presence as much as on the statement, and carries the lower of the
    // two sources. A FOR inferred from a page's «Ομόφωνα» over a sheet's list is
    // the sheet's fact as much as the page's, and the public pages, which print
    // the pages' facts only, must not print it as the page's.
    const presenceSource = new Map<string, DataSource>();
    for (const a of replay.attendance) presenceSource.set(`${a.subjectId}:${a.personId}`, a.source);
    const lowerSource = (a: DataSource, b: DataSource | undefined): DataSource => (b !== undefined && sourceRank(b) > sourceRank(a) ? b : a);

    // Per subject, the highest-precedence source that states a vote supplies the
    // rows; every other source's statement is compared against them and reported.
    const votes: DerivationOutput['votes'] = [];
    for (const s of input.subjects) {
        const stated = statements.get(s.id);
        if (!stated?.length) continue;
        const present = replay.presentBySubject.get(s.id) ?? null;
        const absent = replay.absentBySubject.get(s.id) ?? null;
        // One statement per source: two statements of one source are not two sources.
        const bySource = new Map<string, VoteFacts[]>();
        for (const facts of stated) bySource.set(facts.source, [...(bySource.get(facts.source) ?? []), facts]);
        const expanded = [...bySource.values()].map(mergeStatements).map(facts => {
            const r = expandPartyVotes(facts, present, input.partyMembers);
            issues.push(...r.issues);
            return r.facts;
        });
        const ordered = [...expanded].sort((a, b) => sourceRank(a.source) - sourceRank(b.source));
        const winner = ordered[0];
        const r = deriveVotes(winner, present, input.mayorPersonId, absent);
        // One label for all of a subject's inferred votes: the lowest any of them
        // rests on. A per-row label would leave the public page, which prints the
        // pages' rows only, with a partial list of the room's votes.
        const inferredSource = r.votes.filter(v => v.origin === 'inferred').reduce<DataSource>((low, v) => lowerSource(low, lowerSource(v.source, presenceSource.get(`${s.id}:${v.personId}`))), winner.source);
        votes.push(...r.votes.map(v => (v.origin === 'inferred' ? { ...v, source: inferredSource } : v)));
        issues.push(...r.issues);
        for (const loser of ordered.slice(1)) issues.push(...compareVoteStatements(winner, r.votes, loser));
    }

    // The roll call and the events the derived sources state, ranked, without the
    // manual rows: those are stated facts and already stand in the tables.
    const outputRollCall = [...rankRollCall(rollCall).rows.values()].filter(r => r.source !== 'manual');
    const outputEvents = ranked.events.filter(e => e.source !== 'manual');
    return { attendance: replay.attendance, votes, issues, rollCall: outputRollCall, events: outputEvents };
}
