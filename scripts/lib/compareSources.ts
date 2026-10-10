import { statedOutcomeOf } from '@/lib/derivation/deriveVotes';
import { resolveRollCall } from '@/lib/derivation/resolveSession';
import type { DerivationInput, Evidence, SourceFacts, VoteFacts } from '@/lib/derivation/types';
import type { AttendanceStatus, DataSource, VoteType } from '@prisma/client';

/**
 * How far the sheet's and the transcript's statements agree with the decision
 * documents, fact by fact (issue #807, «measure before relying»). The pages are
 * the reference: every fact a source states that a page also states is one
 * comparison, and a fact only one side states is not.
 */
export interface Disagreement {
    source: DataSource;
    fact: 'rollCall' | 'outcome' | 'vote';
    subjectId: string | null;
    personId: string | null;
    /** What the page states, and what the source states. */
    page: string;
    stated: string;
    evidence: Evidence | undefined;
    decisionId: string | null;
}

export interface SourceAgreement {
    source: DataSource;
    rollCall: { compared: number; agreed: number };
    outcomes: { compared: number; agreed: number };
    votes: { compared: number; agreed: number };
    disagreements: Disagreement[];
}

/**
 * The pages' roll call as the application resolves it (`resolveRollCall`: the
 * strict majority of the usable pages, or the first page of a per-decision
 * body), so the figures measure the sources against the roll call the page
 * would print. None when the resolver finds none.
 */
function pagesRollCall(input: DerivationInput): Map<string, AttendanceStatus> | null {
    const resolved = resolveRollCall(input);
    if (resolved.rollCall.length === 0) return null;
    return new Map(resolved.rollCall.map(r => [r.personId, r.status]));
}

const votesBySubject = (facts: VoteFacts[]) => {
    const m = new Map<string, VoteFacts>();
    for (const f of facts) if (!m.has(f.subjectId)) m.set(f.subjectId, f);
    return m;
};

/** One source against the pages of one meeting. */
export function compareSource(input: DerivationInput, src: SourceFacts): SourceAgreement {
    const out: SourceAgreement = { source: src.source, rollCall: { compared: 0, agreed: 0 }, outcomes: { compared: 0, agreed: 0 }, votes: { compared: 0, agreed: 0 }, disagreements: [] };
    const pagesRoll = pagesRollCall(input);
    if (pagesRoll && src.rollCall) {
        for (const row of src.rollCall) {
            const page = pagesRoll.get(row.personId);
            if (!page) continue;
            out.rollCall.compared += 1;
            if (page === row.status) out.rollCall.agreed += 1;
            else out.disagreements.push({ source: src.source, fact: 'rollCall', subjectId: null, personId: row.personId, page, stated: row.status, evidence: row.evidence, decisionId: null });
        }
    }
    const pageVotes = votesBySubject(input.documents.filter(d => d.hasExtraction).map(d => ({
        subjectId: d.subjectId, source: 'decision' as const, decisionId: d.decisionId, voteResultPhrase: d.voteResultPhrase, statedOutcome: null,
        namedVotes: d.namedVotes, partyVotes: [], tally: d.tally, rawText: d.voteResultPhrase,
    })));
    for (const stated of src.votes) {
        const page = pageVotes.get(stated.subjectId);
        if (!page) continue;
        const pageOutcome = statedOutcomeOf(page), statedOutcome = statedOutcomeOf(stated);
        if (pageOutcome && statedOutcome) {
            out.outcomes.compared += 1;
            if (pageOutcome === statedOutcome) out.outcomes.agreed += 1;
            else out.disagreements.push({ source: src.source, fact: 'outcome', subjectId: stated.subjectId, personId: null, page: pageOutcome, stated: statedOutcome, evidence: stated.evidence, decisionId: page.decisionId });
        }
        const pageVote = new Map<string, VoteType>(page.namedVotes.map(v => [v.personId, v.vote]));
        for (const v of stated.namedVotes) {
            const p = pageVote.get(v.personId);
            if (!p) continue;
            out.votes.compared += 1;
            if (p === v.vote) out.votes.agreed += 1;
            else out.disagreements.push({ source: src.source, fact: 'vote', subjectId: stated.subjectId, personId: v.personId, page: p, stated: v.vote, evidence: v.evidence ?? stated.evidence, decisionId: page.decisionId });
        }
    }
    return out;
}

/** Every source of the meeting against its pages. A meeting with no usable page compares nothing. */
export function compareSources(input: DerivationInput): SourceAgreement[] {
    if (!input.documents.some(d => d.hasExtraction)) return [];
    return input.sources.map(src => compareSource(input, src));
}

/** Sum the agreement of several meetings' comparisons per source. */
export function sumAgreement(rows: SourceAgreement[]): Map<DataSource, Omit<SourceAgreement, 'disagreements'>> {
    const totals = new Map<DataSource, Omit<SourceAgreement, 'disagreements'>>();
    for (const r of rows) {
        const t = totals.get(r.source) ?? { source: r.source, rollCall: { compared: 0, agreed: 0 }, outcomes: { compared: 0, agreed: 0 }, votes: { compared: 0, agreed: 0 } };
        for (const k of ['rollCall', 'outcomes', 'votes'] as const) { t[k].compared += r[k].compared; t[k].agreed += r[k].agreed; }
        totals.set(r.source, t);
    }
    return totals;
}

export const pct = (agreed: number, compared: number) => (compared === 0 ? '—' : `${Math.round((100 * agreed) / compared)}% of ${compared}`);
