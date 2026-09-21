import { readDerivationRows } from '@/lib/db/derivationFacts';
import { CONVENTION_FIELDS, isDecisionConventions, type RollCallLayout } from '@/lib/decisionConventions';
import { orderedMinutesSubjects } from '@/lib/minutes/builders';
import { isMayorRole, isRoleActiveAt, mayorIsMemberOf } from '@/lib/utils/roles';
import type { VoteType } from '@prisma/client';
import type { DerivationInput, DocumentFacts, VoteTally } from './types';

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
 * Read a stored raw extraction (task v3 or v4) into DocumentFacts.
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
    declaredItemNumber: number | null; declaredOutOfAgenda: boolean | null;
}, rosterPersonIds?: ReadonlySet<string>): DocumentFacts {
    const raw = asObject(d.extraction) ?? {};
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
    const storedPresidedBy = asObject(raw.presidedBy);
    return {
        subjectId: d.subjectId, decisionId: d.id, voteResultPhrase: d.voteResultPhrase, namedVotes, tally,
        // Empty means the document states no list, not that it states an empty one.
        presentIds: statedPresent.length > 0 ? statedPresent : null,
        absentIds: null,
        unmatchedNames, incomplete: d.incomplete,
        rollCallLayout: readRollCallLayout(raw), declaredItemNumber: d.declaredItemNumber, declaredOutOfAgenda: d.declaredOutOfAgenda,
        mayorPresent: d.mayorPresent,
        presidedById: typeof storedPresidedBy?.personId === 'string' ? storedPresidedBy.personId : null,
        presidedByName: typeof storedPresidedBy?.name === 'string' ? storedPresidedBy.name : null,
        hasExtraction: d.extraction != null,
    };
}

/** Everything the derivation reads, in the shape it reads it. The only Prisma reads of the module. */
export async function loadDerivationInput(cityId: string, meetingId: string): Promise<DerivationInput> {
    const { meeting, firstUtteranceBySubject, rollCall, events, people } = await readDerivationRows(cityId, meetingId);
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
        rollCall, events,
        documents: ordered.filter(s => s.decision).map(s => documentFactsFromDecision(s.decision!, rosterPersonIds)),
        conventions: isDecisionConventions(conventions) ? conventions : null,
        // Excluded from the rows only where the mayor is not a member of the body (the council); on the committee they vote.
        mayorPersonId: mayor && !mayorIsMemberOf(mayor, meeting.administrativeBodyId, meeting.dateTime) ? mayor.id : null,
        presidentPersonId: president?.id ?? null,
        secretaryPersonId: isDecisionConventions(conventions) && conventions.listOmitsSecretary ? secretary?.id ?? null : null,
    };
}
