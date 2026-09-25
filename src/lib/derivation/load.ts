import { readDerivationRows } from '@/lib/db/derivationFacts';
import { statedChangeOf } from './anchors';
import { CONVENTION_FIELDS, isDecisionConventions, type RollCallLayout } from '@/lib/decisionConventions';
import { orderedMinutesSubjects } from '@/lib/minutes/builders';
import { isMayorRole, isRoleActiveAt, mayorIsMemberOf } from '@/lib/utils/roles';
import type { VoteType } from '@prisma/client';
import type { DerivationInput, DocumentFacts, NameMatch, StatedChange, VoteTally } from './types';

const VOTE_TYPES: VoteType[] = ['FOR', 'AGAINST', 'ABSTAIN', 'PRESENT', 'DID_NOT_VOTE'];

/**
 * The layout the stored extraction says this page printed, against the same value
 * list the body's conventions are written in — a document states a subset of them,
 * and an unrecognised value is no statement at all.
 */
/** A stored JSON value as a bag of fields, or null when it is not one. */
const asObject = (v: unknown): Record<string, unknown> | null =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;

function readRollCallLayout(raw: Record<string, unknown>): RollCallLayout | null {
    const layout = asObject(raw.rollCall)?.layout;
    return typeof layout === 'string' && (CONVENTION_FIELDS.rollCallLayout as readonly string[]).includes(layout)
        ? layout as RollCallLayout : null;
}

/**
 * Whether a stored reading states what its page says: task v4 or later stored it.
 * A v3 reading stored the answer that pipeline had already inferred instead, and a
 * null or unparseable version is unread. The one definition for the derivation,
 * the poll's re-read decision, the minutes and the scripts (spec §5.1).
 */
export function readingStatesFacts(d: { extraction: unknown; extractorVersion: string | null }): boolean {
    return d.extraction != null && Number(d.extractorVersion) >= 4;
}

/**
 * Read a stored raw extraction into DocumentFacts.
 *
 * `rosterPersonIds` is the city's people. Every id from the extraction is
 * checked against it, the way the event path already checks its own: a person
 * deleted after the poll leaves their id in the stored JSON, and a row written
 * for them fails the foreign key inside `replaceDerivedRows`, aborting the
 * transaction — so the meeting could never be derived again. A dropped id
 * counts as an unmatched name of that document instead.
 */
export function documentFactsFromDecision(d: {
    id: string; subjectId: string; voteResultPhrase: string | null; unmatchedNames: string[]; incomplete: boolean; mayorPresent: boolean | null; extraction: unknown;
    declaredItemNumber: number | null; declaredOutOfAgenda: boolean | null; extractorVersion: string | null;
}, rosterPersonIds?: ReadonlySet<string>): DocumentFacts {
    // Only a v4 reading states facts. A v3 `voteDetails` already held the FOR
    // votes the old pipeline inferred, so believing one returns invented votes as
    // `origin: 'stated'`. Emptying the extraction at read covers the rows already
    // in the database: the document counts as unread, and the meeting raises
    // NO_STORED_FACTS and keeps the rows it has. Measured on zografou/apr1_2026,
    // 11 v3 decisions: 61 stated FOR votes, no inferred vote and no issue, beside
    // a v4 meeting of the same city whose every FOR is inferred.
    const statesFacts = readingStatesFacts(d);
    const raw = statesFacts ? asObject(d.extraction) ?? {} : {};
    const onRoster = (personId: string) => !rosterPersonIds || rosterPersonIds.has(personId);
    const statedChanges = (Array.isArray(raw.attendanceChanges) ? raw.attendanceChanges : [])
        .map(statedChangeOf)
        .filter((c): c is StatedChange => c !== null && onRoster(c.personId));
    const nameMatches: NameMatch[] | null = Array.isArray(raw.nameMatches)
        ? raw.nameMatches.flatMap(entry => {
            const m = asObject(entry);
            if (typeof m?.name !== 'string') return [];
            const personId = typeof m.personId === 'string' && onRoster(m.personId) ? m.personId : null;
            const method = m.method === 'token' || m.method === 'llm' ? m.method : null;
            return [{ name: m.name, personId, method }];
        })
        : null;
    const unmatchedNames = [...d.unmatchedNames];
    const inRoster = (personId: string) => {
        if (!rosterPersonIds || rosterPersonIds.has(personId)) return true;
        unmatchedNames.push(personId);
        return false;
    };
    const namedVotes = (Array.isArray(raw.voteDetails) ? raw.voteDetails : []).flatMap(entry => {
        const v = asObject(entry);
        const personId = v?.personId, vote = v?.vote;
        if (typeof personId !== 'string' || typeof vote !== 'string') return [];
        if (!(VOTE_TYPES as readonly string[]).includes(vote) || !inRoster(personId)) return [];
        return [{ personId, vote: vote as VoteType }];
    });
    let tally: VoteTally | null = null;
    const storedTally = asObject(raw.voteTally);
    if (storedTally) {
        tally = {};
        for (const t of VOTE_TYPES) { const v = storedTally[t]; tally[t] = typeof v === 'number' && v >= 0 ? v : null; }
    }
    // The per-decision list is the page's own ΤΑ ΜΕΛΗ after the decision text (v4); the roll call never stands in for it.
    const storedDecisionAttendance = asObject(raw.decisionAttendance);
    const statedPresent = (Array.isArray(storedDecisionAttendance?.presentIds) ? storedDecisionAttendance.presentIds : [])
        .filter((id): id is string => typeof id === 'string')
        .filter(inRoster);
    // A page that names someone under ΑΠΟΧΩΡΗΣΑΝΤΕΣ for this vote and also in
    // its members list has contradicted itself, and the reader has been seen to
    // return that column as the list (Argos 6Ι9ΑΩΨΔ-0Υ8: one name, the departed
    // one, against a roll call of 26). The departure is the more specific
    // statement; the list is not believed for that person.
    const outForThisVote = new Set(statedChanges.filter(c => c.kind === 'DEPARTURE' && c.anchorKind === 'SUBJECT').map(c => c.personId));
    const believedPresent = statedPresent.filter(id => !outForThisVote.has(id));
    const storedRollCall = asObject(raw.rollCall);
    const printed = (v: unknown) => (Array.isArray(v) ? v : []).filter((n): n is string => typeof n === 'string');
    const ids = (v: unknown) => printed(v).filter(inRoster);
    const rollCallPresentIds = ids(storedRollCall?.presentIds), rollCallAbsentIds = ids(storedRollCall?.absentIds);
    const storedPresidedBy = asObject(raw.presidedBy);
    const storedActingSecretary = asObject(raw.actingSecretary);
    return {
        subjectId: d.subjectId, decisionId: d.id, voteResultPhrase: d.voteResultPhrase, namedVotes, tally,
        // Empty means the document states no list, not that it states an empty one.
        presentIds: believedPresent.length > 0 ? believedPresent : null,
        absentIds: null,
        rollCallPresentIds: rollCallPresentIds.length + rollCallAbsentIds.length > 0 ? rollCallPresentIds : null,
        rollCallAbsentIds: rollCallPresentIds.length + rollCallAbsentIds.length > 0 ? rollCallAbsentIds : null,
        lists: {
            rollCallPresent: printed(storedRollCall?.present),
            rollCallAbsent: printed(storedRollCall?.absent),
            decisionPresent: printed(storedDecisionAttendance?.present),
        },
        statedChanges, nameMatches,
        unmatchedNames, incomplete: d.incomplete,
        rollCallLayout: readRollCallLayout(raw), declaredItemNumber: d.declaredItemNumber, declaredOutOfAgenda: d.declaredOutOfAgenda,
        mayorPresent: d.mayorPresent,
        presidedById: typeof storedPresidedBy?.personId === 'string' ? storedPresidedBy.personId : null,
        presidedByName: typeof storedPresidedBy?.name === 'string' ? storedPresidedBy.name : null,
        actingSecretaryId: typeof storedActingSecretary?.personId === 'string' && inRoster(storedActingSecretary.personId) ? storedActingSecretary.personId : null,
        hasExtraction: statesFacts,
    };
}

/** Everything the derivation reads, in the shape it reads it. The only Prisma reads of the module. */
export async function loadDerivationInput(cityId: string, meetingId: string): Promise<DerivationInput> {
    const { meeting, firstUtteranceBySubject, rollCall, events, people, subjectIdsWithStoredVotes } = await readDerivationRows(cityId, meetingId);
    // The same walk the minutes make: record subjects, discussion order, withdrawn
    // dropped. An event anchored «after item 3» is placed by position, so a set or
    // an order of its own would put rows on subjects other than the ones printed.
    const ordered = orderedMinutesSubjects(meeting.subjects, firstUtteranceBySubject).filter(s => !s.withdrawn);
    const mayor = people.find(p => p.roles.some(r => isMayorRole(r) && isRoleActiveAt(r, meeting.dateTime)));
    const president = people.find(p => p.roles.some(r => r.isHead && !!r.administrativeBodyId && r.administrativeBodyId === meeting.administrativeBodyId && isRoleActiveAt(r, meeting.dateTime)));
    const conventions = meeting.administrativeBody?.decisionConventions;
    // The office has no flag of its own in the roster; it is the role's title on the body.
    const secretary = people.find(p => p.roles.some(r => r.name === 'Γραμματέας' && !!r.administrativeBodyId && r.administrativeBodyId === meeting.administrativeBodyId && isRoleActiveAt(r, meeting.dateTime)));
    const rosterPersonIds = new Set(people.map(p => p.id));
    return {
        cityId, meetingId,
        subjects: ordered.map(s => ({ id: s.id, name: s.name, agendaItemIndex: s.agendaItemIndex, nonAgendaReason: s.nonAgendaReason, decisionNumber: s.decision?.decisionNumber ?? null })),
        rollCall, events, subjectIdsWithStoredVotes,
        documents: ordered.filter(s => s.decision).map(s => documentFactsFromDecision(s.decision!, rosterPersonIds)),
        conventions: isDecisionConventions(conventions) ? conventions : null,
        bodyType: meeting.administrativeBody?.type ?? null,
        cityMayorPersonId: mayor?.id ?? null,
        // Excluded from the rows only where the mayor is not a member of the body (the council); on the committee they vote.
        mayorPersonId: mayor && !mayorIsMemberOf(mayor, meeting.administrativeBody ? { id: meeting.administrativeBodyId!, type: meeting.administrativeBody.type } : null, meeting.dateTime) ? mayor.id : null,
        presidentPersonId: president?.id ?? null,
        secretaryPersonId: isDecisionConventions(conventions) && conventions.listOmitsSecretary ? secretary?.id ?? null : null,
    };
}
