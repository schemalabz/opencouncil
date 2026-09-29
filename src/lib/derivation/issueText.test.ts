import { CONVENTION_FIELDS } from '@/lib/decisionConventions';
import elAdmin from '../../../messages/el/admin.json';
import enAdmin from '../../../messages/en/admin.json';
import { catalogText } from '@/i18n/catalogText';
import { issuePerson, nameIssue, renderIssue, renderIssuePerson } from './issueText';
import { issueMessageEn } from './issueTextEn';
import { ISSUE_CODES, type Issue, type IssueCode, type IssueParams, type SourcesDisagreeParams } from './types';

/**
 * The resolver falls back to the key, so a code whose message was never
 * authored — or was renamed with the catalog, or lost an interpolation — prints
 * `issues.messages.X` into every English report of the issues, where it reads
 * as a sentence nobody wrote rather than as a failure. One case per code, because the codes are what the report prints.
 */
const CASES: { [C in IssueCode]: { params: IssueParams[C]; contains?: string[] } } = {
    NO_ROLL_CALL: { params: { reason: 'noMajority' } },
    PRESENCE_UNKNOWN: { params: { reason: 'assumedOpening' } },
    CONVENTIONS_UNCONFIRMED: { params: {} },
    UNMATCHED_NAME: { params: { name: 'Κ. Δήμου' }, contains: ['Κ. Δήμου'] },
    UNPLACEABLE_ANCHOR: { params: { kind: 'ARRIVAL', reason: 'noSuchAgendaItem', detail: '#3' }, contains: ['#3'] },
    IMPLIED_CHANGE: { params: { status: 'ABSENT' } },
    TALLY_MISMATCH: { params: { diffs: [{ type: 'FOR', printed: 8, derived: 7 }] }, contains: ['8', '7'] },
    INCOMPLETE_READ: { params: {} },
    PRESIDING_DISAGREES: { params: { presiding: [{ personId: 'p1', name: 'Α. Παππάς' }, { personId: null, name: 'Β. Νικολάου' }] }, contains: ['Α. Παππάς, Β. Νικολάου'] },
    SOURCES_DISAGREE: { params: { kind: 'doubleVote', firstVote: 'FOR', secondVote: 'AGAINST' } },
    NO_STORED_FACTS: { params: { missing: 3, total: 16 }, contains: ['3', '16'] },
    LAYOUT_DISAGREES: { params: { expected: 'present_and_absent', found: 'composition_and_absent' } },
    ITEM_NUMBER_DISAGREES: { params: { declared: 7, linked: 1 }, contains: ['7', '1'] },
    UNREAD_DOCUMENT: { params: {} },
    LIST_DROPS_PRESENT: { params: {} },
    LIST_ADDS_ABSENT: { params: {} },
    LIST_CUT: { params: { listed: 13, expected: 20, voters: 5 }, contains: ['13', '20', '5'] },
    CLOSING_BLOCK_CUT: { params: {} },
    CLOSING_READ_FAILED: { params: {} },
    PERSON_IN_BOTH_LISTS: { params: {} },
    CHANGE_NOT_CORROBORATED: { params: { stated: 1, total: 9 }, contains: ['1', '9'] },
    LATE_ARRIVAL_IN_OPENING_LIST: { params: {} },
    NAMED_VOTERS_UNEXPECTED: { params: { expected: 'dissenters_only' } },
    NAMES_SHARE_ID: { params: { names: 'Καββαθάς Τρύφων, Κωνσταντίνου Πέτρος' }, contains: ['Καββαθάς Τρύφων'] },
    NAME_MATCHED_TWICE: { params: { name: 'Κων/νος Αναγνωστόπουλος' }, contains: ['Κων/νος Αναγνωστόπουλος'] },
    OUT_OF_AGENDA_PLACED_FIRST: { params: { kind: 'ARRIVAL' } },
    VOTE_BY_ABSENT_MEMBER: { params: { vote: 'DID_NOT_VOTE' }, contains: ['DID NOT VOTE'] },
    NO_VOTE_RESULT: { params: {} },
};

describe('issueMessageEn', () => {
    it.each([...ISSUE_CODES])('says something authored about %s', code => {
        const { params, contains = [] } = CASES[code];
        const text = issueMessageEn({ code, source: null, params } as Issue);
        expect(text).not.toBe(`issues.messages.${code}`);
        // A message the resolver returned unformatted, or an ICU branch that
        // matched nothing, leaves the syntax in the sentence.
        expect(text).not.toMatch(/[{}]/);
        for (const value of contains) expect(text).toContain(value);
    });

    it('gives every value of namedVoters its own NAMED_VOTERS_UNEXPECTED sentence', () => {
        // The message selects on `expected` and ends in a catch-all, so a value
        // with no branch of its own renders the sentence of another value.
        const sentences = new Set(CONVENTION_FIELDS.namedVoters.map(expected => issueMessageEn({ code: 'NAMED_VOTERS_UNEXPECTED', source: null, params: { expected } })));
        expect(sentences.size).toBe(CONVENTION_FIELDS.namedVoters.length);
    });

    it('gives every situation one code reports its own sentence', () => {
        // SOURCES_DISAGREE selects on `kind` and ends in a catch-all, so a kind
        // with no branch of its own renders the generic sentence and says
        // nothing about what actually disagreed. `rollCallVsList` did exactly
        // that until it became LIST_DROPS_PRESENT and LIST_ADDS_ABSENT.
        const kinds: SourcesDisagreeParams[] = [
            { kind: 'event', winKind: 'ARRIVAL', winRawText: 'προσήλθε', winSource: 'decision', loseRawText: 'αποχώρησε', loseSource: 'transcript' },
            { kind: 'statedList', status: 'ABSENT', eventKind: 'ARRIVAL', rawText: 'προσήλθε' },
            { kind: 'doubleVote', firstVote: 'FOR', secondVote: 'AGAINST' },
        ];
        const sentences = new Set(kinds.map(params => issueMessageEn({ code: 'SOURCES_DISAGREE', source: null, params })));
        expect(sentences.size).toBe(kinds.length);
    });
});

describe('UNPLACEABLE_ANCHOR for a range', () => {
    // The resolver raises it with kind DEPARTURE, but neither end of the range is placed.
    const issue: Issue = { code: 'UNPLACEABLE_ANCHOR', personId: 'x', source: 'decision', params: { kind: 'DEPARTURE', reason: 'rangeNotInMeeting', detail: '31–40' } };

    it.each([
        ['el', elAdmin, 'Η απουσία από τις ψηφοφορίες των αποφάσεων 31–40 δεν μπήκε σε κανένα θέμα, ούτε ως αποχώρηση ούτε ως προσέλευση: κανένα θέμα της συνεδρίασης δεν έχει απόφαση με αριθμό σε αυτό το εύρος. Πιθανώς οι αποφάσεις δεν έχουν συνδεθεί ακόμη με θέματα.'],
        ['en', enAdmin, 'The absence from the votes on decisions 31–40 is not placed at any subject, as a departure or as an arrival: no subject of this meeting has a decision number in that range. Possibly the decisions are not linked to subjects yet.'],
    ])('names the range and both of its ends in %s', (_locale, messages, sentence) => {
        expect(renderIssue(catalogText({ messages, namespace: 'decisionsPage' }), issue)).toBe(sentence);
    });

    it.each([
        ['el', elAdmin, 'rangeNoDecisionNumbers', '31–40', 'Η απουσία από τις ψηφοφορίες των αποφάσεων 31–40 δεν μπήκε σε κανένα θέμα, ούτε ως αποχώρηση ούτε ως προσέλευση: κανένα θέμα της συνεδρίασης δεν έχει αριθμό απόφασης.'],
        ['en', enAdmin, 'rangeNoDecisionNumbers', '31–40', 'The absence from the votes on decisions 31–40 is not placed at any subject, as a departure or as an arrival: no subject of this meeting has a decision number.'],
        ['el', elAdmin, 'rangeNumberNoDigits', '31–σαράντα', 'Η απουσία από τις ψηφοφορίες των αποφάσεων «31–σαράντα» δεν μπήκε σε κανένα θέμα, ούτε ως αποχώρηση ούτε ως προσέλευση: ένας αριθμός απόφασης του εύρους δεν έχει ψηφία.'],
        ['en', enAdmin, 'rangeNumberNoDigits', '31–σαράντα', 'The absence from the votes on decisions “31–σαράντα” is not placed at any subject, as a departure or as an arrival: a decision number of the range has no digits.'],
    ] as const)('names the whole range in %s for %s', (_locale, messages, reason, detail, sentence) => {
        expect(renderIssue(catalogText({ messages, namespace: 'decisionsPage' }), { ...issue, params: { kind: 'DEPARTURE', reason, detail } })).toBe(sentence);
    });

    it('still names the one change for every other reason', () => {
        expect(issueMessageEn({ ...issue, params: { kind: 'DEPARTURE', reason: 'noDecisionNumbers', detail: '31–40' } }))
            .toBe('The derivation could not find which subject the departure happened at: no subject of this meeting has a decision number.');
    });
});

describe('the names two messages print', () => {
    const en = catalogText({ messages: enAdmin, namespace: 'decisionsPage' });
    const people: Record<string, string> = { p1: 'Παπαδόπουλος Γιώργος' };
    const names = {
        person: (id: string) => people[id],
        subject: (id: string) => (id === 's3' ? '3. Έγκριση προϋπολογισμού' : undefined),
    };

    it('names the presiding members from the page\'s people, and falls back to the printed name, never to an id', () => {
        const issue: Issue = { code: 'PRESIDING_DISAGREES', source: 'decision',
            params: { presiding: [{ personId: 'p1', name: 'Γ. Παπαδόπουλος' }, { personId: 'p7', name: 'Κ. Δήμου' }] } };
        const named = renderIssue(en, nameIssue(issue, names));
        expect(named).toContain('(Παπαδόπουλος Γιώργος, Κ. Δήμου)');
        expect(named).not.toMatch(/p1|p7/);
        // A script holds no page people: it prints the names the pages printed.
        expect(issueMessageEn(issue)).toContain('(Γ. Παπαδόπουλος, Κ. Δήμου)');
    });

    it('names the subject a change could not be placed at by its agenda number and title', () => {
        const issue: Issue = { code: 'UNPLACEABLE_ANCHOR', personId: 'p1', source: 'manual',
            params: { kind: 'ARRIVAL', reason: 'noSuchSubject', detail: 's3' } };
        const named = renderIssue(en, nameIssue(issue, names));
        expect(named).toContain('subject “3. Έγκριση προϋπολογισμού” is no longer in the meeting order');
        expect(named).not.toContain('s3');
    });

    it('leaves every other message as it is', () => {
        const issue: Issue = { code: 'UNPLACEABLE_ANCHOR', personId: 'p1', source: 'decision',
            params: { kind: 'ARRIVAL', reason: 'noSuchAgendaItem', detail: 's3' } };
        expect(nameIssue(issue, names)).toBe(issue);
    });
});

describe('issuePerson', () => {
    const names: Record<string, string> = { p1: 'Παπαδόπουλος Γιώργος' };
    const nameOf = (id: string) => names[id];

    it('names the member of every issue that carries a personId, whatever its code', () => {
        // The codes the derivation raises with a personId today. The helper
        // reads the field, not the code, so the list documents rather than gates.
        const personCodes: IssueCode[] = [
            'VOTE_BY_ABSENT_MEMBER', 'LIST_DROPS_PRESENT', 'LIST_ADDS_ABSENT', 'IMPLIED_CHANGE', 'PERSON_IN_BOTH_LISTS',
            'LATE_ARRIVAL_IN_OPENING_LIST', 'CHANGE_NOT_CORROBORATED', 'NAMES_SHARE_ID', 'SOURCES_DISAGREE',
            'UNPLACEABLE_ANCHOR', 'OUT_OF_AGENDA_PLACED_FIRST',
        ];
        for (const code of personCodes) {
            const issue = { code, personId: 'p1', source: 'decision', params: CASES[code].params } as Issue;
            expect(issuePerson(issue, nameOf)).toEqual({ kind: 'member', name: 'Παπαδόπουλος Γιώργος' });
        }
    });

    it('names nobody for a name no single person stands behind: the message already prints the name', () => {
        expect(issuePerson({ code: 'UNMATCHED_NAME', source: 'decision', params: { name: 'Κ. Δήμου' } }, nameOf)).toBeNull();
        expect(issuePerson({ code: 'NAME_MATCHED_TWICE', source: 'decision', params: { name: 'Κων/νος Αναγνωστόπουλος' } }, nameOf)).toBeNull();
    });

    it('names nobody for an id the caller does not know, rather than printing the id', () => {
        expect(issuePerson({ code: 'IMPLIED_CHANGE', personId: 'p9', source: 'decision', params: { status: 'ABSENT' } }, nameOf)).toBeNull();
    });

    it('names nobody for an issue about the meeting or a page', () => {
        expect(issuePerson({ code: 'NO_ROLL_CALL', source: null, params: { reason: 'noRollCall' } }, nameOf)).toBeNull();
        expect(issuePerson({ code: 'TALLY_MISMATCH', subjectId: 's1', source: 'decision', params: { diffs: [] } }, nameOf)).toBeNull();
    });
});

describe('renderIssuePerson', () => {
    it.each([
        ['el', elAdmin, 'Μέλος: Παπαδόπουλος Γιώργος'],
        ['en', enAdmin, 'Member: Παπαδόπουλος Γιώργος'],
    ])('labels a member in %s', (_locale, messages, member) => {
        const t = catalogText({ messages, namespace: 'decisionsPage' });
        expect(renderIssuePerson(t, { kind: 'member', name: 'Παπαδόπουλος Γιώργος' })).toBe(member);
    });
});
