import { AttendanceEventKind, AttendanceAnchorKind, AttendanceTiming, NonAgendaReason, type DataSource, type VoteType } from '@prisma/client';
import type { MeetingFactsReading, StatedVote } from '@/lib/apiTypes';
import { statedChangeOf } from './anchors';
import type { Evidence, NameMatch, OrderedSubject, RollCallRow, SourceFacts, StatedChange, VoteFacts, VoteTally } from './types';

const VOTE_TYPES: VoteType[] = ['FOR', 'AGAINST', 'ABSTAIN', 'PRESENT', 'DID_NOT_VOTE'];
const OUTCOMES = ['unanimous', 'majority', 'rejected'] as const;

/** What resolving a reading needs of the meeting: its subjects in order, and who is who. */
export interface SourceContext {
    subjects: OrderedSubject[];
    /** The city's people; an id outside it is dropped, as the pages' ids are. */
    rosterPersonIds: ReadonlySet<string>;
    /** The person now assigned to each utterance's speaker, for a party answering by voice. */
    speakerPersonByUtterance: ReadonlyMap<string, string | null>;
    /** Each person's party on the meeting date. */
    partyByPerson: ReadonlyMap<string, string | null>;
    /** The city's parties by name, for a party the source names. */
    partyIdByName: ReadonlyMap<string, string>;
}

const asObject = (v: unknown): Record<string, unknown> | null =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The subjects an item range covers, in the derivation's order. */
export function subjectsOfRange(subjects: OrderedSubject[], range: { kind: string; from: number; to: number }): OrderedSubject[] {
    const lo = Math.min(range.from, range.to), hi = Math.max(range.from, range.to);
    if (range.kind === 'agenda_item') {
        return subjects.filter(s => s.nonAgendaReason !== 'outOfAgenda' && s.agendaItemIndex !== null && s.agendaItemIndex >= lo && s.agendaItemIndex <= hi);
    }
    if (range.kind === 'out_of_agenda') {
        let n = 0;
        return subjects.filter(s => s.nonAgendaReason === 'outOfAgenda' && (++n) >= lo && n <= hi);
    }
    return [];
}

function evidenceOf(o: Record<string, unknown>): Evidence | undefined {
    const utteranceId = str(o.utteranceId) ?? str(asArray(o.utteranceIds)[0]);
    const line = num(o.line);
    if (!utteranceId && line === null) return undefined;
    return { ...(utteranceId ? { utteranceId } : {}), ...(line !== null ? { line } : {}) };
}

/** A sheet's or the transcript's roll call, one row per person, the first entry of a person standing. */
function rollCallOf(source: DataSource, raw: unknown, ctx: SourceContext): RollCallRow[] | null {
    const rc = asObject(raw);
    if (!rc) return null;
    const rows = new Map<string, RollCallRow>();
    for (const entry of asArray(rc.entries)) {
        const e = asObject(entry);
        const personId = str(e?.personId);
        if (!e || !personId || !ctx.rosterPersonIds.has(personId) || rows.has(personId)) continue;
        if (e.status !== 'PRESENT' && e.status !== 'ABSENT') continue;
        rows.set(personId, {
            personId, status: e.status, source,
            absenceJustified: typeof e.absenceJustified === 'boolean' ? e.absenceJustified : null,
            rawText: str(e.rawText) ?? '', evidence: evidenceOf(e),
        });
    }
    return [...rows.values()];
}

/**
 * A per-vote absence a sheet states («absent for item 5») is a departure before
 * and an arrival after that item, the shape the replay settles as one absence.
 * A range of decision numbers is a page's vocabulary; a sheet or the transcript
 * knows no decision numbers, so such an anchor is dropped.
 */
function absenceAsPair(e: Record<string, unknown>, anchor: Record<string, unknown>): StatedChange[] | null {
    const personId = str(e.personId);
    if (!personId) return null;
    const base = { personId, anchorAgendaItemIndex: null, anchorNonAgendaReason: null, anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, rawText: str(e.rawText) ?? '' };
    if (anchor.kind === 'agenda_item' && num(anchor.agendaItemIndex) !== null) {
        const at = { anchorKind: AttendanceAnchorKind.AGENDA_ITEM, anchorAgendaItemIndex: num(anchor.agendaItemIndex), anchorNonAgendaReason: anchor.nonAgendaReason === 'outOfAgenda' ? NonAgendaReason.outOfAgenda : null };
        return [
            { ...base, ...at, kind: AttendanceEventKind.DEPARTURE, timing: AttendanceTiming.BEFORE },
            { ...base, ...at, kind: AttendanceEventKind.ARRIVAL, timing: AttendanceTiming.AFTER },
        ];
    }
    if (anchor.kind === 'subject' && str(anchor.subjectId)) {
        const at = { anchorKind: AttendanceAnchorKind.SUBJECT, anchorSubjectId: str(anchor.subjectId) };
        return [
            { ...base, ...at, kind: AttendanceEventKind.DEPARTURE, timing: AttendanceTiming.BEFORE },
            { ...base, ...at, kind: AttendanceEventKind.ARRIVAL, timing: AttendanceTiming.AFTER },
        ];
    }
    return null;
}

function changesOf(raw: unknown, ctx: SourceContext): SourceFacts['statedChanges'] {
    const out: SourceFacts['statedChanges'] = [];
    for (const entry of asArray(raw)) {
        const e = asObject(entry);
        if (!e) continue;
        const personId = str(e.personId);
        if (!personId || !ctx.rosterPersonIds.has(personId)) continue;
        const evidence = evidenceOf(e);
        if (e.type === 'absent_for_vote') {
            const anchor = asObject(e.anchor);
            const pair = anchor ? absenceAsPair(e, anchor) : null;
            if (pair) out.push(...pair.map(c => ({ ...c, evidence })));
            continue;
        }
        const change = statedChangeOf(e);
        if (change) out.push({ ...change, evidence });
    }
    return out;
}

function tallyOf(raw: unknown): VoteTally | null {
    const t = asObject(raw);
    if (!t) return null;
    const tally: VoteTally = {};
    for (const type of VOTE_TYPES) { const v = t[type]; tally[type] = typeof v === 'number' && v >= 0 ? v : null; }
    return Object.values(tally).some(v => v != null) ? tally : null;
}

/** One vote statement, expanded to one VoteFacts per subject it covers; none when it covers no subject. */
function voteFactsOf(source: DataSource, raw: unknown, ctx: SourceContext): { facts: VoteFacts[]; unplaced: SourceFacts['unplacedVotes'] } {
    const v = asObject(raw);
    if (!v) return { facts: [], unplaced: [] };
    const rawText = str(v.rawText) ?? '';
    const evidence = evidenceOf(v);
    const covered = new Map<string, OrderedSubject>();
    for (const item of asArray(v.items)) {
        const r = asObject(item);
        const kind = str(r?.kind), from = num(r?.from), to = num(r?.to);
        if (!r || !kind || from === null || to === null) continue;
        for (const s of subjectsOfRange(ctx.subjects, { kind, from, to })) covered.set(s.id, s);
    }
    if (covered.size === 0) return { facts: [], unplaced: [{ rawText, evidence }] };

    const namedVotes: VoteFacts['namedVotes'] = [];
    for (const entry of asArray(v.namedVotes)) {
        const n = asObject(entry);
        const personId = str(n?.personId), vote = str(n?.vote);
        if (!n || !personId || !vote || !ctx.rosterPersonIds.has(personId) || !(VOTE_TYPES as string[]).includes(vote)) continue;
        namedVotes.push({ personId, vote: vote as VoteType, evidence: evidenceOf(n) ?? evidence });
    }
    const partyVotes: VoteFacts['partyVotes'] = [];
    for (const entry of asArray(v.partyVotes)) {
        const p = asObject(entry);
        const vote = str(p?.vote);
        if (!p || !vote || !(VOTE_TYPES as string[]).includes(vote)) continue;
        const speakerUtteranceId = str(p.speakerUtteranceId);
        const named = str(p.party);
        // The party as named is the party meant: «η παράταξη Χ κατά» is about X even
        // when someone else says it, and a name the city does not know stays
        // unresolved (PARTY_VOTE_UNRESOLVED) rather than becoming the speaker's party.
        // Only an answer that names no party («Εμείς κατά») is the speaker's own.
        const speaker = speakerUtteranceId ? ctx.speakerPersonByUtterance.get(speakerUtteranceId) ?? null : null;
        const partyId = named ? ctx.partyIdByName.get(named) ?? null : speaker ? ctx.partyByPerson.get(speaker) ?? null : null;
        partyVotes.push({ partyId, vote: vote as VoteType, rawText: str(p.rawText) ?? rawText, evidence: speakerUtteranceId ? { utteranceId: speakerUtteranceId } : evidence });
    }
    const outcome = str(v.outcome);
    const facts: VoteFacts[] = [...covered.keys()].map(subjectId => ({
        subjectId, source, decisionId: null,
        voteResultPhrase: str(v.phrase) || null,
        statedOutcome: outcome && (OUTCOMES as readonly string[]).includes(outcome) ? outcome as VoteFacts['statedOutcome'] : null,
        namedVotes, partyVotes, tally: tallyOf(v.tally), rawText, evidence,
    }));
    return { facts, unplaced: [] };
}

/**
 * What one source states, read off its stored reading (`MeetingFactsReading` as
 * the task returned it, or as a reviewer corrected it). Defensive over the JSON,
 * as `documentFactsFromDecision` is over a page: an entry that names nobody on
 * the roster, or an item the meeting does not have, is dropped or reported and
 * never a crash.
 */
export function sourceFactsFromReading(source: DataSource, reading: unknown, ctx: SourceContext): SourceFacts {
    const r = asObject(reading) ?? {};
    const votes: VoteFacts[] = [];
    const unplacedVotes: SourceFacts['unplacedVotes'] = [];
    for (const raw of asArray(r.votes)) {
        const { facts, unplaced } = voteFactsOf(source, raw as StatedVote, ctx);
        votes.push(...facts); unplacedVotes.push(...unplaced);
    }
    const presidedBy = asObject(r.presidedBy);
    const presidedById = str(presidedBy?.personId);
    const nameMatches: NameMatch[] | null = Array.isArray(r.nameMatches)
        ? r.nameMatches.flatMap(entry => {
            const m = asObject(entry);
            if (typeof m?.name !== 'string') return [];
            const personId = str(m.personId);
            const method = m.method === 'token' || m.method === 'llm' ? m.method : null;
            return [{ name: m.name, personId: personId && ctx.rosterPersonIds.has(personId) ? personId : null, method }];
        })
        : null;
    return {
        source,
        rollCall: rollCallOf(source, r.rollCall, ctx),
        statedChanges: changesOf(r.attendanceChanges, ctx),
        votes, unplacedVotes,
        presidedById: presidedById && ctx.rosterPersonIds.has(presidedById) ? presidedById : null,
        presidedByName: str(presidedBy?.name),
        nameMatches,
        unmatchedNames: asArray(r.unmatchedNames).filter((n): n is string => typeof n === 'string'),
    };
}

/** The utterance ids a reading refers to, for the loader to look their speakers up. */
export function utteranceIdsOfReading(reading: unknown): string[] {
    const r = asObject(reading) ?? {};
    const ids = new Set<string>();
    for (const raw of asArray(r.votes)) {
        const v = asObject(raw);
        for (const p of asArray(v?.partyVotes)) { const id = str(asObject(p)?.speakerUtteranceId); if (id) ids.add(id); }
    }
    return [...ids];
}

/** Whether a stored `MeetingFactsReading` is one at all: an object with the lists a reader returns. */
export function isMeetingFactsReading(v: unknown): v is MeetingFactsReading {
    const r = asObject(v);
    return r !== null && Array.isArray(r.attendanceChanges) && Array.isArray(r.votes);
}
