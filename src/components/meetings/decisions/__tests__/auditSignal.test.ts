import { auditSignalFor } from '../auditSignal';
import type { DerivedVoteRow, Issue } from '@/lib/derivation/types';

const issue = (over: Partial<Issue> = {}): Issue => ({
    code: 'INCOMPLETE_READ', subjectId: 's1', source: null, params: {},
    ...over,
} as Issue);

const noName = () => undefined;

const vote = (origin: DerivedVoteRow['origin'], personId = 'p1'): DerivedVoteRow =>
    ({ subjectId: 's1', personId, voteType: 'FOR', origin, source: 'decision' });

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
            votes: [],
            personName: noName,
        });
        expect(signal).toMatchObject({ severity: 'error', kind: 'issues', code: 'NO_STORED_FACTS', extraIssues: 2 });
    });

    it('keeps a body that names only its dissenters grey, and out of the filter', () => {
        // Nearly every row of such a meeting infers its votes from the roll
        // call, and that is the correct reading — a warning on each one would
        // be the mode crying wolf on a healthy meeting.
        const signal = auditSignalFor({
            issues: [],
            votes: [vote('stated'), vote('inferred', 'p2'), vote('inferred', 'p3')],
            personName: noName,
        });
        expect(signal).toMatchObject({ severity: 'info', kind: 'inferredVotes', inferred: 2, derivedVotes: 3, needsCheck: false });
    });

    it('says so when every vote is a name the document printed', () => {
        const signal = auditSignalFor({ issues: [], votes: [vote('stated')], personName: noName });
        expect(signal).toMatchObject({ kind: 'stated', severity: 'info' });
    });

    it('lets an issue speak over the votes', () => {
        const signal = auditSignalFor({ issues: [issue({ code: 'TALLY_MISMATCH' })], votes: [vote('inferred')], personName: noName });
        expect(signal).toMatchObject({ kind: 'issues', code: 'TALLY_MISMATCH', needsCheck: true });
    });

    it('names the member each issue is about', () => {
        const signal = auditSignalFor({
            issues: [issue({ code: 'VOTE_BY_ABSENT_MEMBER', personId: 'p7', params: { vote: 'FOR' } })],
            votes: [],
            personName: id => (id === 'p7' ? 'Παπαδόπουλος Γιώργος' : undefined),
        });
        expect(signal?.issues).toEqual([expect.objectContaining({ person: { kind: 'member', name: 'Παπαδόπουλος Γιώργος' } })]);
    });

    it('draws no line for a subject whose outcome has nothing to audit', () => {
        expect(auditSignalFor({ issues: [], votes: [], personName: noName })).toBeNull();
    });
});
