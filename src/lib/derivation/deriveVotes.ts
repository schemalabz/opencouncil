import type { VoteType } from '@prisma/client';
import { parseVoteTally } from '@/lib/decisions/voteTally';
import type { DerivedVoteRow, Issue, StatedOutcomeWord, TallyDiff, VoteFacts, VoteTally } from './types';


const UNANIMOUS = /[οό]μ[οό]φ[ωώ]ν/i;
const MAJORITY = /κατ[άα]\s+πλειοψηφ[ίι]/i;

/** The outcome a document's own words name. A phrase names one or it does not. */
export type PhraseOutcome = 'unanimous' | 'majority';

/**
 * The outcome the document's own words name: «ομόφωνα», «ΟΜΟΦΩΝΑ»,
 * «ομοφώνως» → unanimous; «κατά πλειοψηφία» → majority. Null when the
 * phrase counts votes and names no outcome: Vrilissia prints «Με πέντε (5)
 * θετικές ψήφους» where nobody voted against and somebody declared ΠΑΡΩΝ,
 * which is neither word. The one reading of the outcome — anything that prints
 * one asks here instead of carrying a second copy of the patterns.
 */
export function phraseOutcome(phrase: string | null | undefined): PhraseOutcome | null {
    if (!phrase) return null;
    const unanimous = UNANIMOUS.test(phrase), majority = MAJORITY.test(phrase);
    // A multi-part vote names both («α) ομόφωνα … γ) κατά πλειοψηφία …»); either
    // word alone would misstate it, so the page's own sentence is printed instead.
    if (unanimous && majority) return null;
    if (unanimous) return 'unanimous';
    if (majority) return 'majority';
    return null;
}

/**
 * ομόφωνα, κατά πλειοψηφία, or a counted phrase: FOR may be inferred from presence.
 * A count is one the shared parser reads, which binds the digit to the count word —
 * «θετική γνωμοδότηση» next to any article number is not a vote count.
 */
export function phrasePermitsInference(phrase: string | null | undefined): boolean {
    if (!phrase) return false;
    return UNANIMOUS.test(phrase) || MAJORITY.test(phrase) || parseVoteTally(phrase).for != null;
}

/**
 * The outcome one source states for a subject: the phrase's own word, else the
 * word the source stated beside it. The sheet and the transcript state an
 * outcome word where the pages print a phrase; the two are compared here.
 */
export function statedOutcomeOf(facts: Pick<VoteFacts, 'voteResultPhrase' | 'statedOutcome'>): StatedOutcomeWord | null {
    if (facts.statedOutcome === 'rejected') return 'rejected';
    return phraseOutcome(facts.voteResultPhrase) ?? facts.statedOutcome;
}

/**
 * One source's statements about one subject, as one. A reader can return two
 * («Προς ψήφιση» and the answer); ranked as rivals, a statement with no outcome
 * can beat the one that has it. The first statement with an outcome leads; the
 * named votes of every statement join it, the first stated per person winning;
 * the party votes are all kept; the tally comes from the first that has one.
 */
export function mergeStatements(statements: VoteFacts[]): VoteFacts {
    if (statements.length === 1) return statements[0];
    const lead = statements.find(s => statedOutcomeOf(s) !== null) ?? statements[0];
    const named = new Map<string, VoteFacts['namedVotes'][number]>();
    for (const s of [lead, ...statements.filter(s => s !== lead)]) {
        for (const v of s.namedVotes) if (!named.has(v.personId)) named.set(v.personId, v);
    }
    // A party's answer read twice (the overlap of two chunks, the call and the
    // answer) is one answer: one per party and vote, or per sentence when the
    // party is unresolved.
    const party = new Map<string, VoteFacts['partyVotes'][number]>();
    for (const s of statements) for (const pv of s.partyVotes) {
        const key = pv.partyId ? `${pv.partyId}|${pv.vote}` : `?|${pv.vote}|${pv.rawText}`;
        if (!party.has(key)) party.set(key, pv);
    }
    return {
        ...lead,
        namedVotes: [...named.values()],
        partyVotes: [...party.values()],
        tally: statements.find(s => s.tally !== null)?.tally ?? null,
    };
}

/**
 * The counts the page prints, field by field: the structured value where the
 * reader filled one, else the number the phrase carries. Taking the structured
 * tally whole as soon as any field held a value dropped the phrase's other
 * counts — `{ FOR: 5 }` beside «ΥΠΕΡ 5 ΚΑΤΑ 2» lost the 2 against.
 */
function tallyOf(facts: Pick<VoteFacts, 'voteResultPhrase' | 'tally'>): VoteTally | null {
    const p = parseVoteTally(facts.voteResultPhrase);
    const fromPhrase: VoteTally = { FOR: p.for, AGAINST: p.against, ABSTAIN: p.blank };
    const tally: VoteTally = {};
    for (const type of new Set([...Object.keys(facts.tally ?? {}), ...Object.keys(fromPhrase)]) as Set<VoteType>) {
        tally[type] = facts.tally?.[type] ?? fromPhrase[type] ?? null;
    }
    return Object.values(tally).some(v => v != null) ? tally : null;
}

/**
 * The vote rows for one subject from one source's statement: what the source
 * named (stated), plus the vote every present member it did not name gets when
 * the outcome permits it (inferred): FOR under «ομόφωνα», «κατά πλειοψηφία» or
 * a count; AGAINST under a unanimous rejection («Ομόφωνα … να μην κοπεί»). A
 * printed count that disagrees with the rows is a TALLY_MISMATCH issue; a named
 * vote of a member in `absent` (the subject's ABSENT rows) is a
 * VOTE_BY_ABSENT_MEMBER issue, and the row stays. Every issue names the source
 * and carries the statement's evidence.
 */
export function deriveVotes(facts: VoteFacts, present: Set<string> | null, mayorPersonId: string | null, absent: ReadonlySet<string> | null = null): { votes: DerivedVoteRow[]; issues: Issue[] } {
    const votes: DerivedVoteRow[] = [];
    const issues: Issue[] = [];
    const seen = new Set<string>();
    const statedVote = new Map<string, VoteType>();
    const where = { subjectId: facts.subjectId, decisionId: facts.decisionId ?? undefined, source: facts.source, evidence: facts.evidence } as const;
    for (const v of facts.namedVotes) {
        if (v.personId === mayorPersonId) continue;
        const first = statedVote.get(v.personId);
        if (first !== undefined) {
            // The same row twice is harmless; two different votes for one member is
            // the source contradicting itself, and the first reading is kept.
            if (first !== v.vote) issues.push({ code: 'SOURCES_DISAGREE', ...where, personId: v.personId, rawText: facts.voteResultPhrase ?? undefined,
                evidence: v.evidence ?? facts.evidence, params: { kind: 'doubleVote', firstVote: first, secondVote: v.vote } });
            continue;
        }
        statedVote.set(v.personId, v.vote);
        seen.add(v.personId);
        votes.push({ subjectId: facts.subjectId, personId: v.personId, voteType: v.vote, origin: 'stated', source: facts.source });
        // The source's own vote against the attendance the sources resolved: one of
        // the two is wrong, and nothing here says which, so the vote row stays.
        if (absent?.has(v.personId)) issues.push({ code: 'VOTE_BY_ABSENT_MEMBER', ...where, personId: v.personId,
            evidence: v.evidence ?? facts.evidence, params: { vote: v.vote } });
    }
    // The mayor's own FOR is not "the page named somebody FOR": the mayor stays
    // out of the rows («The mayor» in docs/guides/meeting-minutes.md), so counting it here would switch inference off for
    // every member of a body its mayor chairs. A page names FOR voters only when
    // it lists every voter, so a named FOR ends inference; the sheet and the
    // transcript name whoever was marked or spoke («Υπέρ.» from two leaders),
    // and the rest of the room still voted with the outcome.
    const namedFor = facts.source === 'decision' && facts.namedVotes.some(v => v.vote === 'FOR' && v.personId !== mayorPersonId);
    // One resolved tally for the permit and for the vetoes below. A v4 reading can
    // leave some or all structured entries null while the phrase carries the
    // count, so reading the two from different places let such a phrase permit
    // inference without forbidding it.
    const tally = tallyOf(facts);
    const outcome = statedOutcomeOf(facts);
    // A unanimous rejection gives every unnamed present member AGAINST; a rejection
    // by majority says nothing about who was for. Otherwise a counted ΥΠΕΡ is the
    // phrase's own content: it permits inference even when the phrase states no outcome word.
    const inferred: VoteType | null = outcome === 'rejected'
        ? (phraseOutcome(facts.voteResultPhrase) === 'unanimous' ? 'AGAINST' : null)
        : (phrasePermitsInference(facts.voteResultPhrase) || outcome !== null || (tally?.FOR ?? 0) > 0 ? 'FOR' : null);
    // But a tally that counts dissent it does not attribute forbids it: a page
    // reading «ΥΠΕΡ 26 ΚΑΤΑ 6» and naming nobody would otherwise give FOR to all
    // 32 present, the six against included, turning a contested decision into a
    // unanimous one. Where the dissenters are named they are already in `seen`,
    // the counts are accounted for, and inference is safe for the rest — which
    // is the common case: of 452 stored readings only one counts dissent it
    // never names, so this guards a rare shape rather than a frequent one.
    // Counted against the votes actually stated, one per person: `namedVotes` can
    // list a member twice, and counting the raw entries would let one dissenter
    // named twice cover a tally of two — leaving the second, unidentified one to
    // be inferred FOR.
    const statedOf = (type: VoteType) => [...statedVote.values()].filter(v => v === type).length;
    const unattributedDissent = (['AGAINST', 'ABSTAIN', 'PRESENT', 'DID_NOT_VOTE'] as const)
        .some(type => (tally?.[type] ?? 0) > statedOf(type));
    // A printed ΥΠΕΡ count is a ceiling. More unnamed members present than it
    // leaves room for means some of them voted otherwise — ΠΑΡΩΝ, λευκό, against,
    // or out of the room — in a way no counted dissent above reports: a phrase
    // counting ΠΑΡΩΝ, or Vrilissia's bare «Με πέντε (5) θετικές ψήφους». Nothing
    // says which of them, so none is given a FOR; the tally check below reports
    // the gap.
    const unnamedPresent = present ? [...present].filter(personId => personId !== mayorPersonId && !seen.has(personId)).length : 0;
    const exceedsPrintedFor = tally?.FOR != null && statedOf('FOR') + unnamedPresent > tally.FOR;
    const permits = inferred === 'AGAINST' ? true : inferred === 'FOR' && !namedFor && !unattributedDissent && !exceedsPrintedFor;
    if (present && inferred && permits) {
        for (const personId of present) {
            if (personId === mayorPersonId || seen.has(personId)) continue;
            seen.add(personId);
            votes.push({ subjectId: facts.subjectId, personId, voteType: inferred, origin: 'inferred', source: facts.source });
        }
    }
    // A subject with no attendance rows prints its outcome from the
    // phrase alone, so there is nothing for the printed count to disagree with.
    const printedTally = present === null ? null : tally;
    if (printedTally) {
        const diffs: TallyDiff[] = [];
        for (const [type, printed] of Object.entries(printedTally) as [VoteType, number | null][]) {
            if (printed == null) continue;
            const derived = votes.filter(v => v.voteType === type).length;
            if (derived !== printed) diffs.push({ type, printed, derived });
        }
        if (diffs.length) issues.push({ code: 'TALLY_MISMATCH', ...where, params: { diffs }, rawText: facts.voteResultPhrase ?? undefined });
    }
    return { votes, issues };
}

/**
 * A party's answer, resolved to the party's members present at the subject:
 * «Εμείς κατά» is every member of that party in the room, less those the
 * source already named. A party that could not be resolved, or a subject whose
 * presence is unknown, cannot name anyone and is reported instead.
 */
export function expandPartyVotes(facts: VoteFacts, present: ReadonlySet<string> | null, partyMembers: Map<string, string[]>): { facts: VoteFacts; issues: Issue[] } {
    if (facts.partyVotes.length === 0) return { facts, issues: [] };
    const issues: Issue[] = [];
    const named = new Set(facts.namedVotes.map(v => v.personId));
    const namedVotes = [...facts.namedVotes];
    for (const pv of facts.partyVotes) {
        const members = pv.partyId ? partyMembers.get(pv.partyId) ?? [] : [];
        const voters = present ? members.filter(personId => present.has(personId)) : [];
        if (!pv.partyId || !present || voters.length === 0) {
            issues.push({ code: 'PARTY_VOTE_UNRESOLVED', subjectId: facts.subjectId, source: facts.source, rawText: pv.rawText, evidence: pv.evidence ?? facts.evidence, params: { vote: pv.vote } });
            continue;
        }
        for (const personId of voters) {
            if (named.has(personId)) continue;
            named.add(personId);
            namedVotes.push({ personId, vote: pv.vote, evidence: pv.evidence ?? facts.evidence });
        }
    }
    return { facts: { ...facts, namedVotes, partyVotes: [] }, issues };
}

/**
 * What a lower-precedence source states about a subject's vote, against the
 * rows the winning source produced: a different outcome word, or a different
 * vote for a member the winner has a row for. Each is one SOURCES_DISAGREE,
 * with the loser's evidence, so the reviewer can check the moment or the line.
 * A member the loser names and the winner has no row for is not compared: the
 * presence rows already say the member was absent, and that disagreement is
 * reported on its own.
 */
export function compareVoteStatements(winner: VoteFacts, winnerRows: DerivedVoteRow[], loser: VoteFacts): Issue[] {
    const issues: Issue[] = [];
    const winOutcome = statedOutcomeOf(winner), loseOutcome = statedOutcomeOf(loser);
    if (winOutcome && loseOutcome && winOutcome !== loseOutcome) {
        issues.push({ code: 'SOURCES_DISAGREE', subjectId: loser.subjectId, source: winner.source, rawText: loser.rawText ?? undefined, evidence: loser.evidence,
            params: { kind: 'outcome', winSource: winner.source, winOutcome, loseSource: loser.source, loseOutcome } });
    }
    const winVote = new Map(winnerRows.map(r => [r.personId, r.voteType]));
    for (const v of loser.namedVotes) {
        const w = winVote.get(v.personId);
        if (w === undefined || w === v.vote) continue;
        issues.push({ code: 'SOURCES_DISAGREE', subjectId: loser.subjectId, personId: v.personId, source: winner.source, rawText: loser.rawText ?? undefined,
            evidence: v.evidence ?? loser.evidence, params: { kind: 'vote', winSource: winner.source, winVote: w, loseSource: loser.source, loseVote: v.vote } });
    }
    return issues;
}
