import type { VoteType } from '@prisma/client';
import { parseVoteTally } from '@/lib/decisions/voteTally';
import type { DerivedVoteRow, DocumentFacts, Issue, TallyDiff, VoteTally } from './types';

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
 * The counts the page prints, field by field: the structured value where the
 * reader filled one, else the number the phrase carries. Taking the structured
 * tally whole as soon as any field held a value dropped the phrase's other
 * counts — `{ FOR: 5 }` beside «ΥΠΕΡ 5 ΚΑΤΑ 2» lost the 2 against.
 */
function tallyOf(doc: DocumentFacts): VoteTally | null {
    const p = parseVoteTally(doc.voteResultPhrase);
    const fromPhrase: VoteTally = { FOR: p.for, AGAINST: p.against, ABSTAIN: p.blank };
    const tally: VoteTally = {};
    for (const type of new Set([...Object.keys(doc.tally ?? {}), ...Object.keys(fromPhrase)]) as Set<VoteType>) {
        tally[type] = doc.tally?.[type] ?? fromPhrase[type] ?? null;
    }
    return Object.values(tally).some(v => v != null) ? tally : null;
}

/**
 * The vote rows for one subject: what the document named (stated), plus FOR for
 * every present member it did not name when the phrase permits it (inferred). A
 * printed count that disagrees with the rows is a TALLY_MISMATCH issue.
 */
export function deriveVotes(doc: DocumentFacts, present: Set<string> | null, mayorPersonId: string | null): { votes: DerivedVoteRow[]; issues: Issue[] } {
    const votes: DerivedVoteRow[] = [];
    const issues: Issue[] = [];
    const seen = new Set<string>();
    const statedVote = new Map<string, VoteType>();
    for (const v of doc.namedVotes) {
        if (v.personId === mayorPersonId) continue;
        const first = statedVote.get(v.personId);
        if (first !== undefined) {
            // The same row twice is harmless; two different votes for one member is
            // the document contradicting itself, and the first reading is kept.
            if (first !== v.vote) issues.push({ code: 'SOURCES_DISAGREE', subjectId: doc.subjectId, personId: v.personId,
                decisionId: doc.decisionId, source: 'decision', rawText: doc.voteResultPhrase ?? undefined,
                params: { kind: 'doubleVote', firstVote: first, secondVote: v.vote } });
            continue;
        }
        statedVote.set(v.personId, v.vote);
        seen.add(v.personId);
        votes.push({ subjectId: doc.subjectId, personId: v.personId, voteType: v.vote, origin: 'stated' });
    }
    // The mayor's own FOR is not "the page named somebody FOR": §6.5 keeps the
    // mayor out of the rows, so counting it here would switch inference off for
    // every member of a body its mayor chairs.
    const namedFor = doc.namedVotes.some(v => v.vote === 'FOR' && v.personId !== mayorPersonId);
    // One resolved tally for the permit and for the vetoes below. A v4 reading can
    // leave some or all structured entries null while the phrase carries the
    // count, so reading the two from different places let such a phrase permit
    // inference without forbidding it.
    const tally = tallyOf(doc);
    // A counted ΥΠΕΡ is the phrase's own content: it permits inference even when the phrase states no outcome word.
    const permits = phrasePermitsInference(doc.voteResultPhrase) || (tally?.FOR ?? 0) > 0;
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
    if (present && !namedFor && permits && !unattributedDissent && !exceedsPrintedFor) {
        for (const personId of present) {
            if (personId === mayorPersonId || seen.has(personId)) continue;
            seen.add(personId);
            votes.push({ subjectId: doc.subjectId, personId, voteType: 'FOR', origin: 'inferred' });
        }
    }
    // Spec §6.3: a subject with no attendance rows prints its outcome from the
    // phrase alone, so there is nothing for the printed count to disagree with.
    const printedTally = present === null ? null : tally;
    if (printedTally) {
        const diffs: TallyDiff[] = [];
        for (const [type, printed] of Object.entries(printedTally) as [VoteType, number | null][]) {
            if (printed == null) continue;
            const derived = votes.filter(v => v.voteType === type).length;
            if (derived !== printed) diffs.push({ type, printed, derived });
        }
        if (diffs.length) issues.push({ code: 'TALLY_MISMATCH', subjectId: doc.subjectId, decisionId: doc.decisionId, source: 'decision',
            params: { diffs }, rawText: doc.voteResultPhrase ?? undefined });
    }
    return { votes, issues };
}
