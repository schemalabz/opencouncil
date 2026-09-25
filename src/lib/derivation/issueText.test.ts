import { issueMessageEn } from './issueTextEn';
import { ISSUE_CODES, type Issue, type IssueCode, type IssueParams, type SourcesDisagreeParams } from './types';

/**
 * The resolver falls back to the key, so a code whose message was never
 * authored — or was renamed with the catalog, or lost an interpolation — prints
 * `issues.messages.X` into the meeting checker's report and into the
 * verification sheets, where it reads as a sentence nobody wrote rather than as
 * a failure. One case per code, because the codes are what the report prints.
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
    PRESIDING_DISAGREES: { params: { names: 'Α. Παππάς, Β. Νικολάου' }, contains: ['Α. Παππάς, Β. Νικολάου'] },
    SOURCES_DISAGREE: { params: { kind: 'doubleVote', firstVote: 'FOR', secondVote: 'AGAINST' } },
    NO_STORED_FACTS: { params: { missing: 3, total: 16 }, contains: ['3', '16'] },
    LAYOUT_DISAGREES: { params: { expected: 'present_and_absent', found: 'composition_and_absent' } },
    ITEM_NUMBER_DISAGREES: { params: { declared: 7, linked: 1 }, contains: ['7', '1'] },
    UNREAD_DOCUMENT: { params: {} },
    LIST_DROPS_PRESENT: { params: {} },
    LIST_ADDS_ABSENT: { params: {} },
    PERSON_IN_BOTH_LISTS: { params: {} },
    CHANGE_NOT_CORROBORATED: { params: { stated: 1, total: 9 }, contains: ['1', '9'] },
    LATE_ARRIVAL_IN_OPENING_LIST: { params: {} },
    NAMED_VOTERS_UNEXPECTED: { params: { expected: 'dissenters_only' } },
    NAMES_SHARE_ID: { params: { names: 'Καββαθάς Τρύφων, Κωνσταντίνου Πέτρος' }, contains: ['Καββαθάς Τρύφων'] },
    NAME_MATCHED_TWICE: { params: { name: 'Κων/νος Αναγνωστόπουλος' }, contains: ['Κων/νος Αναγνωστόπουλος'] },
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

    it('gives every situation one code reports its own sentence', () => {
        // SOURCES_DISAGREE selects on `kind` and ends in a catch-all, so a kind
        // with no branch of its own renders the generic sentence and says
        // nothing about what actually disagreed. `rollCallVsList` did exactly
        // that until it became LIST_DROPS_PRESENT and LIST_ADDS_ABSENT.
        const kinds: SourcesDisagreeParams[] = [
            { kind: 'rollCall', winSource: 'decision', winStatus: 'PRESENT', loseSource: 'transcript', loseStatus: 'ABSENT' },
            { kind: 'event', winKind: 'ARRIVAL', winRawText: 'προσήλθε', winSource: 'decision', loseRawText: 'αποχώρησε', loseSource: 'transcript' },
            { kind: 'statedList', status: 'ABSENT', eventKind: 'ARRIVAL', rawText: 'προσήλθε' },
            { kind: 'doubleVote', firstVote: 'FOR', secondVote: 'AGAINST' },
        ];
        const sentences = new Set(kinds.map(params => issueMessageEn({ code: 'SOURCES_DISAGREE', source: null, params })));
        expect(sentences.size).toBe(kinds.length);
    });
});
