import { auditSignalFor } from '../auditSignal';
import type { DerivedVoteRow, Issue } from '@/lib/derivation/types';

const issue = (over: Partial<Issue> = {}): Issue => ({
    code: 'INCOMPLETE_READ', subjectId: 's1', source: null, params: {},
    ...over,
} as Issue);

const vote = (origin: DerivedVoteRow['origin'], personId = 'p1'): DerivedVoteRow =>
    ({ subjectId: 's1', personId, voteType: 'FOR', origin });

describe('auditSignalFor', () => {
    it('names the worst issue and counts the rest', () => {
        // Worst by the catalogue's severity for each code: the rows carry none.
        // A warning, an error and a note, in that order, so the answer is not
        // the first row.
        const signal = auditSignalFor({
            issues: [
                issue({ code: 'UNMATCHED_NAME', params: { name: 'Κ. Δήμου' } }),
                issue({ code: 'NO_STORED_FACTS' }),
                issue({ code: 'CONVENTIONS_UNCONFIRMED' }),
            ],
            phraseOnly: false,
            votes: [],
        });
        expect(signal).toMatchObject({ severity: 'error', kind: 'issues', code: 'NO_STORED_FACTS', extraIssues: 2 });
    });

    it('keeps a body that names only its dissenters grey, and out of the filter', () => {
        // Nearly every row of such a meeting infers its votes from the roll
        // call, and that is the correct reading — a warning on each one would
        // be the mode crying wolf on a healthy meeting.
        const signal = auditSignalFor({
            issues: [],
            phraseOnly: false,
            votes: [vote('stated'), vote('inferred', 'p2'), vote('inferred', 'p3')],
        });
        expect(signal).toMatchObject({ severity: 'info', kind: 'inferredVotes', inferred: 2, derivedVotes: 3, needsCheck: false });
    });

    it('says so when every vote is a name the document printed', () => {
        const signal = auditSignalFor({ issues: [], phraseOnly: false, votes: [vote('stated')] });
        expect(signal).toMatchObject({ kind: 'stated', severity: 'info' });
    });

    it('reports an outcome with nobody behind it', () => {
        const signal = auditSignalFor({ issues: [], phraseOnly: true, votes: [] });
        expect(signal).toMatchObject({ kind: 'phraseOnly', severity: 'info' });
    });

    it('lets an issue speak over the phrase-only state', () => {
        const signal = auditSignalFor({
            issues: [issue({ code: 'TALLY_MISMATCH' })],
            phraseOnly: true,
            votes: [],
        });
        expect(signal).toMatchObject({ kind: 'issues', code: 'TALLY_MISMATCH', needsCheck: true });
    });

    it('draws no line for a subject whose outcome has nothing to audit', () => {
        expect(auditSignalFor({ issues: [], phraseOnly: false, votes: [] })).toBeNull();
    });
});
