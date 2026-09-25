// persist.ts (imported by trace.ts for derivationSkipIssue) pulls in the
// Prisma singleton, which loads src/env.mjs — an ESM module ts-jest cannot
// require. Mocking the data-access module it imports keeps the test on the
// pure derivation code, the way persist.test.ts already does.
jest.mock('@/lib/db/derivationFacts', () => ({ readDerivationRows: jest.fn(), replaceDerivedRows: jest.fn() }));

import { buildMeetingTrace, type MeetingTraceMeta } from '../trace';
import { issueMessageEn } from '@/lib/derivation/issueTextEn';
import type { DecisionConventions } from '@/lib/decisionConventions';
import type { DerivationInput, DerivationOutput, DocumentFacts, Issue, StatedChange } from '@/lib/derivation/types';

const doc = (subjectId: string, decisionId: string, o: Partial<DocumentFacts> = {}): DocumentFacts => ({
    subjectId, decisionId, voteResultPhrase: null, namedVotes: [], tally: null, presentIds: null, absentIds: null,
    rollCallPresentIds: null, rollCallAbsentIds: null,
    lists: { rollCallPresent: [], rollCallAbsent: [], decisionPresent: [] }, statedChanges: [], nameMatches: null,
    unmatchedNames: [], incomplete: false, rollCallLayout: null, declaredItemNumber: null, declaredOutOfAgenda: null,
    mayorPresent: null, presidedById: null, presidedByName: null, actingSecretaryId: null, hasExtraction: true, ...o,
});

const departure = (personId: string, item: number): StatedChange => ({
    personId, kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: item, anchorNonAgendaReason: null,
    anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: 'AFTER', rawText: `${personId} left after item ${item}`,
});

describe('buildMeetingTrace', () => {
    const conventions: DecisionConventions = {
        version: 1, rollCallLayout: 'present_and_absent', presentListMeaning: 'opening', attendanceChangeAnchors: ['agenda_item'],
        statesPerDecisionAttendance: false, statesPerVoteAbsence: false, usesSubstitutes: false, namedVoters: 'dissenters_only',
        mayorStatedSeparately: false, provenance: { source: 'profile' },
    };

    const input: DerivationInput = {
        cityId: 'c', meetingId: 'm', conventions, mayorPersonId: null, presidentPersonId: null, secretaryPersonId: null,
        bodyType: null, cityMayorPersonId: null, rollCall: [], events: [], subjectIdsWithStoredVotes: [],
        subjects: [
            { id: 's1', name: 'First subject', agendaItemIndex: 1, nonAgendaReason: null, decisionNumber: '10' },
            { id: 's2', name: 'Second subject', agendaItemIndex: 2, nonAgendaReason: null, decisionNumber: '11' },
        ],
        documents: [
            doc('s1', 'd1', {
                rollCallPresentIds: ['a', 'b'], rollCallAbsentIds: ['c'],
                lists: { rollCallPresent: ['Alpha', 'Bravo'], rollCallAbsent: ['Charlie'], decisionPresent: [] },
                statedChanges: [departure('c', 2)], unmatchedNames: ['Foo'],
            }),
            doc('s2', 'd2', {
                rollCallPresentIds: ['a', 'b'], rollCallAbsentIds: ['c'],
                lists: { rollCallPresent: ['Alpha', 'Bravo'], rollCallAbsent: ['Charlie'], decisionPresent: [] },
                statedChanges: [departure('c', 2)],
            }),
        ],
    };

    const unmatchedName: Issue = { code: 'UNMATCHED_NAME', subjectId: 's1', decisionId: 'd1', source: 'decision', rawText: 'Foo', params: { name: 'Foo' } };
    const impliedChange: Issue = { code: 'IMPLIED_CHANGE', subjectId: 's2', personId: 'b', decisionId: 'd2', source: 'decision', params: { status: 'ABSENT' } };

    const output: DerivationOutput = {
        attendance: [
            { subjectId: 's1', personId: 'a', status: 'PRESENT', origin: 'derived' },
            { subjectId: 's1', personId: 'c', status: 'ABSENT', origin: 'derived' },
            { subjectId: 's2', personId: 'a', status: 'ABSENT', origin: 'derived' },
        ],
        votes: [
            { subjectId: 's1', personId: 'a', voteType: 'FOR', origin: 'inferred' },
            { subjectId: 's1', personId: 'b', voteType: 'AGAINST', origin: 'inferred' },
        ],
        issues: [unmatchedName, impliedChange],
        phraseOnlySubjectIds: [],
        rollCall: [{ personId: 'a', status: 'PRESENT', source: 'decision' }, { personId: 'b', status: 'PRESENT', source: 'decision' }, { personId: 'c', status: 'ABSENT', source: 'decision' }],
        events: [],
    };

    const meta: MeetingTraceMeta = {
        commit: 'abc123',
        meeting: { name: 'Test Meeting', date: '2026-01-01T00:00:00.000Z', body: { name: 'Council', type: 'council' } },
        decisions: { s1: { ada: 'ADA1', url: 'http://pdf1', version: '4' }, s2: { ada: null, url: 'http://pdf2', version: '4' } },
        personNames: { a: 'Alpha', b: 'Bravo', c: 'Charlie' },
    };

    it('carries the meeting, the commit and the refusal', () => {
        const trace = buildMeetingTrace(input, output, meta);
        expect(trace.meeting).toMatchObject({ cityId: 'c', meetingId: 'm', name: 'Test Meeting', date: '2026-01-01T00:00:00.000Z', body: { name: 'Council', type: 'council' } });
        expect(trace.meeting.conventions).toMatchObject({ presentListMeaning: 'opening', confirmedBy: null });
        expect(trace.commit).toBe('abc123');
        expect(trace.refused).toBeNull();
    });

    it("reports each page's roll call, own list and name matches", () => {
        const trace = buildMeetingTrace(input, output, meta);
        expect(trace.pages).toHaveLength(2);
        expect(trace.pages[0]).toMatchObject({
            ada: 'ADA1', url: 'http://pdf1', subjectId: 's1', item: 1, nonAgenda: false, decisionNumber: '10', version: '4', usable: true,
            rollCall: { layout: null, present: 2, absent: 1, matchedPresent: 2, matchedAbsent: 1 },
            ownList: null, statedChanges: 1, nameMatches: null, unmatchedNames: ['Foo'],
        });
        expect(trace.pages[1]).toMatchObject({ ada: null, url: 'http://pdf2' });
    });

    it('picks the majority roll-call rule and reports the pages behind it', () => {
        const trace = buildMeetingTrace(input, output, meta);
        expect(trace.resolve.rollCall).toEqual({ rule: 'majority', pagesAgreeing: 2, pagesWithRollCall: 2, missing: null, present: 2, absent: 1 });
    });

    it('picks the majority events rule and keeps the change every page states', () => {
        const trace = buildMeetingTrace(input, output, meta);
        expect(trace.resolve.events).toMatchObject({ rule: 'majority', kept: 1, dropped: 0 });
        expect(trace.resolve.events.list).toEqual([{ person: 'Charlie', kind: 'DEPARTURE', anchor: 'item 2', timing: 'AFTER', reporting: 2, total: 2, source: 'decision' }]);
    });

    it('labels the roll call stated when another source sets one, but merges it with the pages rather than replacing them', () => {
        // The pages resolve a: PRESENT, b: PRESENT, c: ABSENT (asserted above). A manual row
        // for 'a' only overrides 'a' — production never picks one source wholesale
        // (deriveMeetingFacts, measureMeeting) — so b and c still count, and 'a' flips
        // because a manual source outranks the pages' (SOURCE_PRECEDENCE).
        const stated: DerivationInput = { ...input, rollCall: [{ personId: 'a', status: 'ABSENT', source: 'manual' }] };
        const trace = buildMeetingTrace(stated, output, meta);
        expect(trace.resolve.rollCall).toMatchObject({ rule: 'stated', present: 1, absent: 2 });
    });

    it('picks the first-page roll-call rule for a per-decision body and reports the pages behind it', () => {
        const perDecision: DerivationInput = {
            ...input, conventions: { ...conventions, presentListMeaning: 'per_decision' },
            documents: [
                doc('s1', 'd1', { rollCallPresentIds: ['a'], rollCallAbsentIds: ['b'], lists: { rollCallPresent: ['Alpha'], rollCallAbsent: ['Bravo'], decisionPresent: [] } }),
                doc('s2', 'd2', { rollCallPresentIds: ['a', 'b'], lists: { rollCallPresent: ['Alpha', 'Bravo'], rollCallAbsent: [], decisionPresent: [] } }),
            ],
        };
        const trace = buildMeetingTrace(perDecision, output, meta);
        expect(trace.resolve.rollCall).toMatchObject({ rule: 'first-page', pagesAgreeing: 1, pagesWithRollCall: 2, present: 1, absent: 1 });
    });

    it('counts present, absent and votes per subject', () => {
        const trace = buildMeetingTrace(input, output, meta);
        expect(trace.rows).toEqual({
            attendance: 3, votes: 2,
            bySubject: [
                { subjectId: 's1', item: 1, name: 'First subject', present: 1, absent: 1, votes: { FOR: 1, AGAINST: 1 } },
                { subjectId: 's2', item: 2, name: 'Second subject', present: 0, absent: 1, votes: {} },
            ],
        });
    });

    it('renders each issue with its stage, severity, subject and person name', () => {
        const trace = buildMeetingTrace(input, output, meta);
        expect(trace.issues).toEqual([
            { code: 'UNMATCHED_NAME', stage: 'read', severity: 'warning', subjectId: 's1', person: null, message: issueMessageEn(unmatchedName) },
            { code: 'IMPLIED_CHANGE', stage: 'presence', severity: 'info', subjectId: 's2', person: 'Bravo', message: issueMessageEn(impliedChange) },
        ]);
    });
});
