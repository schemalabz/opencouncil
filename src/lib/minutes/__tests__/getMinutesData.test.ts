/** @jest-environment node */

/**
 * Every place the minutes print a subject name must print the verbatim agenda
 * title when the subject has one (#616): the section name, the "discussed with"
 * cross-reference, the "discussed elsewhere" back-reference, and the
 * cross-subject markers inside the transcript.
 */

const mockGetCouncilMeetingDirect = jest.fn();
const mockGetSubjectsForMeeting = jest.fn();
const mockGetCity = jest.fn();
const mockUtteranceFindMany = jest.fn();
const mockGetPeopleForCity = jest.fn(async (): Promise<unknown[]> => []);
const mockGetMeetingAttendance = jest.fn(async (): Promise<unknown[]> => []);
const mockAttendanceEventFindMany = jest.fn(async (): Promise<unknown[]> => []);

jest.mock('@/lib/db/meetings', () => ({ getCouncilMeetingDirect: (...a: unknown[]) => mockGetCouncilMeetingDirect(...a) }));
jest.mock('@/lib/db/subject', () => ({ getSubjectsForMeeting: (...a: unknown[]) => mockGetSubjectsForMeeting(...a) }));
jest.mock('@/lib/db/cities', () => ({ getCity: (...a: unknown[]) => mockGetCity(...a) }));
jest.mock('@/lib/db/decisions', () => ({
    getExtractedDataForMeeting: jest.fn().mockResolvedValue([]),
    getMeetingAttendance: () => mockGetMeetingAttendance(),
}));
jest.mock('@/lib/db/people', () => ({ getPeopleForCity: () => mockGetPeopleForCity() }));
jest.mock('@/lib/sorting/people', () => ({ ...jest.requireActual('@/lib/sorting/people'), getElectedOrderForBody: () => null }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    // getMinutesData reads the stored attendance events to print the changes
    // block; only the mayor suite below states any.
    default: {
        utterance: { findMany: (...a: unknown[]) => mockUtteranceFindMany(...a) },
        attendanceEvent: { findMany: () => mockAttendanceEventFindMany() },
    },
}));

import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { buildRollCall } from '@/lib/minutes/builders';
import { MinutesCrossSubjectEntry } from '@/lib/minutes/types';

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';

function subjectRow(o: {
    id: string;
    name: string;
    agendaItemTitle: string | null;
    agendaItemIndex: number;
    discussedIn?: { id: string; name: string; agendaItemTitle: string | null; agendaItemIndex: number; nonAgendaReason?: string | null };
}) {
    return {
        id: o.id,
        name: o.name,
        agendaItemTitle: o.agendaItemTitle,
        agendaItemIndex: o.agendaItemIndex,
        nonAgendaReason: null,
        withdrawn: false,
        discussedIn: o.discussedIn ? { nonAgendaReason: null, ...o.discussedIn } : null,
        decision: null,
        highlights: [],
        contributions: [],
        location: null,
        topic: null,
    };
}

function utterance(o: { id: string; start: number; end: number; subjectId: string; status?: string }) {
    return {
        id: o.id,
        text: `text ${o.id}`,
        startTimestamp: o.start,
        endTimestamp: o.end,
        discussionSubjectId: o.subjectId,
        discussionStatus: o.status ?? 'DISCUSSED',
        speakerSegment: { speakerTag: { label: 'Ομιλητής', personId: null } },
    };
}

describe('getMinutesData — subject names carry the agenda title', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCity.mockResolvedValue({
            name: 'Χανιά', name_municipality: 'Δήμος Χανίων', timezone: 'Europe/Athens', logoImage: null,
        });
        mockGetCouncilMeetingDirect.mockResolvedValue({
            id: MEETING_ID, cityId: CITY_ID, name: 'Συνεδρίαση', dateTime: new Date('2026-03-04T18:00:00Z'),
            administrativeBody: null,
        });
        // s1 has a title, s2 does not, s3 has a title and is discussed with s1.
        mockGetSubjectsForMeeting.mockResolvedValue([
            subjectRow({ id: 's1', name: 'Περίληψη ενός', agendaItemTitle: 'ΤΙΤΛΟΣ ΕΝΑ', agendaItemIndex: 1 }),
            subjectRow({ id: 's2', name: 'Περίληψη δύο', agendaItemTitle: null, agendaItemIndex: 2 }),
            subjectRow({
                id: 's3', name: 'Περίληψη τρία', agendaItemTitle: 'ΤΙΤΛΟΣ ΤΡΙΑ', agendaItemIndex: 3,
                discussedIn: { id: 's1', name: 'Περίληψη ενός', agendaItemTitle: 'ΤΙΤΛΟΣ ΕΝΑ', agendaItemIndex: 1 },
            }),
        ]);
        // u2 sits inside s1's window but is linked to s3 — a cross-subject utterance.
        mockUtteranceFindMany.mockResolvedValue([
            utterance({ id: 'u1', start: 0, end: 10, subjectId: 's1' }),
            utterance({ id: 'u2', start: 20, end: 25, subjectId: 's3' }),
            utterance({ id: 'u3', start: 30, end: 40, subjectId: 's1' }),
            utterance({ id: 'u4', start: 100, end: 110, subjectId: 's2' }),
        ]);
    });

    it('prints the title as the section name, and the summary name when there is none', async () => {
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        const byId = new Map(data.subjects.map(s => [s.subjectId, s]));

        expect(byId.get('s1')!.name).toBe('ΤΙΤΛΟΣ ΕΝΑ');
        expect(byId.get('s2')!.name).toBe('Περίληψη δύο');
        expect(byId.get('s3')!.name).toBe('ΤΙΤΛΟΣ ΤΡΙΑ');
    });

    it('prints the title in the discussedWith cross-reference', async () => {
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        const s3 = data.subjects.find(s => s.subjectId === 's3')!;

        expect(s3.discussedWith).toEqual({ id: 's1', name: 'ΤΙΤΛΟΣ ΕΝΑ', agendaItemIndex: 1, nonAgendaReason: null });
    });

    it('prints the title in the discussedElsewhere back-reference', async () => {
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        const s3 = data.subjects.find(s => s.subjectId === 's3')!;

        expect(s3.discussedElsewhere).toEqual([
            { subjectId: 's1', name: 'ΤΙΤΛΟΣ ΕΝΑ', agendaItemIndex: 1 },
        ]);
    });

    it('prints the title on the cross-subject markers inside the transcript', async () => {
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        const s1 = data.subjects.find(s => s.subjectId === 's1')!;

        const crossNames = s1.transcriptEntries
            .filter((e): e is MinutesCrossSubjectEntry => e.type === 'cross-subject')
            .map(e => e.subject.name);

        expect(crossNames.length).toBeGreaterThan(0);
        expect(new Set(crossNames)).toEqual(new Set(['ΤΙΤΛΟΣ ΤΡΙΑ']));
    });
});

describe('getMinutesData — discussion summary and procedural votes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCouncilMeetingDirect.mockResolvedValue({
            id: MEETING_ID, cityId: CITY_ID, name: 'Συνεδρίαση', dateTime: new Date('2026-06-15T18:00:00Z'), administrativeBody: null,
        });
        mockGetCity.mockResolvedValue({ name: 'Δήμος', name_municipality: 'Δήμος', timezone: 'Europe/Athens', logoImage: null, realm: 'greece' });
        mockGetSubjectsForMeeting.mockResolvedValue([
            subjectRow({ id: 's1', name: 'Ένα', agendaItemTitle: null, agendaItemIndex: 1 }),
            subjectRow({ id: 's2', name: 'Δύο', agendaItemTitle: null, agendaItemIndex: 2 }),
            { ...subjectRow({ id: 'oa1', name: 'Κατεπείγον', agendaItemTitle: null, agendaItemIndex: 0 }), agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' },
        ]);
        mockUtteranceFindMany.mockResolvedValue([
            utterance({ id: 'u0', start: 10, end: 20, subjectId: 'oa1', status: 'PROCEDURAL_VOTE' }),
            utterance({ id: 'u1', start: 100, end: 160, subjectId: 's1', status: 'SUBJECT_DISCUSSION' }),
            utterance({ id: 'u2', start: 200, end: 210, subjectId: 's2', status: 'VOTE' }),
            utterance({ id: 'u3', start: 300, end: 330, subjectId: 'oa1', status: 'SUBJECT_DISCUSSION' }),
        ]);
    });

    it('carries the discussion summary of every subject', async () => {
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        const byId = new Map(data.subjects.map(s => [s.subjectId, s.discussion]));
        expect(byId.get('s1')).toEqual({ kind: 'discussed', seconds: 60, start: 100 });
        expect(byId.get('s2')).toEqual({ kind: 'voteOnly', seconds: 0, start: 200 });
        expect(byId.get('oa1')).toEqual({ kind: 'discussed', seconds: 30, start: 300 });
    });

    it('records the out-of-agenda admission vote without moving the subject', async () => {
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        expect(data.proceduralVotes).toEqual([
            { subjectId: 'oa1', timestamp: 10 },
        ]);
        expect(data.subjects.map(s => s.subjectId)).toEqual(['s1', 's2', 'oa1']);
    });
});

describe('getMinutesData — a mayor who is a member of the committee', () => {
    const COMMITTEE = { id: 'committee', name: 'Δημοτική Επιτροπή', type: 'committee' };
    const role = (o: { isHead?: boolean; cityId?: string | null; administrativeBodyId?: string | null }) => ({
        id: `r-${Math.random()}`, name: null, isHead: o.isHead ?? false, cityId: o.cityId ?? null, partyId: null,
        administrativeBodyId: o.administrativeBodyId ?? null, startDate: null, endDate: null, party: null, administrativeBody: null,
    });
    const person = (id: string, name: string, roles: ReturnType<typeof role>[]) => ({ id, name, name_short: name, roles });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCouncilMeetingDirect.mockResolvedValue({
            id: MEETING_ID, cityId: CITY_ID, name: 'Συνεδρίαση', dateTime: new Date('2026-07-21T11:00:00Z'), administrativeBody: COMMITTEE,
        });
        mockGetCity.mockResolvedValue({ name: 'Άργος', name_municipality: 'Δήμος Άργους', timezone: 'Europe/Athens', logoImage: null, realm: 'greece' });
        mockGetSubjectsForMeeting.mockResolvedValue([
            subjectRow({ id: 's1', name: 'Ένα', agendaItemTitle: null, agendaItemIndex: 1 }),
            subjectRow({ id: 's2', name: 'Δύο', agendaItemTitle: null, agendaItemIndex: 2 }),
        ]);
        mockUtteranceFindMany.mockResolvedValue([]);
        // The mayor sits on the committee; another member presides.
        mockGetPeopleForCity.mockResolvedValue([
            person('mayor', 'Ιωάννης Μαλτέζος', [role({ isHead: true, cityId: CITY_ID }), role({ administrativeBodyId: COMMITTEE.id })]),
            person('p1', 'Χρήστος Πετσέλης', [role({ isHead: true, administrativeBodyId: COMMITTEE.id })]),
            person('m1', 'Αντώνης Λιόλιος', [role({ administrativeBodyId: COMMITTEE.id })]),
        ]);
        mockGetMeetingAttendance.mockResolvedValue(['mayor', 'p1', 'm1'].map(personId => ({
            personId, status: 'PRESENT', person: { name: personId === 'mayor' ? 'Ιωάννης Μαλτέζος' : personId === 'p1' ? 'Χρήστος Πετσέλης' : 'Αντώνης Λιόλιος' },
        })));
        mockAttendanceEventFindMany.mockResolvedValue([{
            personId: 'mayor', kind: 'DEPARTURE', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 2, anchorNonAgendaReason: null,
            anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: 'BEFORE', rawText: 'Ο Δήμαρχος αποχώρησε',
        }]);
    });

    afterEach(() => {
        mockGetPeopleForCity.mockResolvedValue([]);
        mockGetMeetingAttendance.mockResolvedValue([]);
        mockAttendanceEventFindMany.mockResolvedValue([]);
    });

    it('counts the mayor among the members', async () => {
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        expect(data.councilComposition!.members.map(m => m.personId)).toEqual(expect.arrayContaining(['mayor', 'p1', 'm1']));
        expect(data.councilComposition!.members).toHaveLength(3);
    });

    it("lists the departure of a mayor who does not preside once, in the changes list like any member's", async () => {
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        expect(data.attendanceChanges).toEqual([
            expect.objectContaining({ personId: 'mayor', type: 'departure', atSubject: expect.objectContaining({ id: 's2' }) }),
        ]);
        expect(data.councilComposition!.mayor!.note ?? '').not.toContain('αποχώρησε');
    });

    it("prints the departure of a mayor who presides on the president's line, not in the changes list", async () => {
        // «ΠΡΟΕΔΡΟΣ: Μαλτέζος Ιωάννης (ΔΗΜΑΡΧΟΣ)»: the mayor heads the committee.
        mockGetPeopleForCity.mockResolvedValue([
            person('mayor', 'Ιωάννης Μαλτέζος', [role({ isHead: true, cityId: CITY_ID }), role({ isHead: true, administrativeBodyId: COMMITTEE.id })]),
            person('p1', 'Χρήστος Πετσέλης', [role({ administrativeBodyId: COMMITTEE.id })]),
            person('m1', 'Αντώνης Λιόλιος', [role({ administrativeBodyId: COMMITTEE.id })]),
        ]);
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        expect(data.attendanceChanges).toEqual([]);
        expect(data.councilComposition!.president).toMatchObject({ personId: 'mayor' });
        expect(data.councilComposition!.mayor!.note).toBe('αποχώρησε από το 2ο θέμα');
        const rollCall = buildRollCall(data.councilComposition!, new Set(), data.administrativeBody?.type ?? null);
        expect(rollCall.president).toMatchObject({ isMayor: true, printedNote: 'αποχώρησε από το 2ο θέμα' });
        // Still a member: the counts agree with the tallies.
        expect(rollCall.present.map(e => e.member.personId)).toContain('mayor');
    });

    it('names who presided when the mayor who presides was absent, and lists the mayor\'s arrival once, in the changes list', async () => {
        // «ΠΡΟΕΔΡΟΣ: Πετσέλης Χρήστος (λόγω απουσίας του ΠΡΟΕΔΡΟΥ, ΔΗΜΑΡΧΟΥ Μαλτέζος Ιωάννης)»
        mockGetPeopleForCity.mockResolvedValue([
            person('mayor', 'Ιωάννης Μαλτέζος', [role({ isHead: true, cityId: CITY_ID }), role({ isHead: true, administrativeBodyId: COMMITTEE.id })]),
            person('p1', 'Χρήστος Πετσέλης', [role({ administrativeBodyId: COMMITTEE.id })]),
            person('m1', 'Αντώνης Λιόλιος', [role({ administrativeBodyId: COMMITTEE.id })]),
        ]);
        mockGetMeetingAttendance.mockResolvedValue(['mayor', 'p1', 'm1'].map(personId => ({
            personId, status: personId === 'mayor' ? 'ABSENT' : 'PRESENT',
            person: { name: personId === 'mayor' ? 'Ιωάννης Μαλτέζος' : personId === 'p1' ? 'Χρήστος Πετσέλης' : 'Αντώνης Λιόλιος' },
        })));
        mockAttendanceEventFindMany.mockResolvedValue([{
            personId: 'mayor', kind: 'ARRIVAL', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 2, anchorNonAgendaReason: null,
            anchorDecisionNumber: null, anchorSubjectId: null, anchorPhase: null, timing: 'BEFORE', rawText: 'Ο Δήμαρχος προσήλθε',
        }]);
        const presidedBy = { name: 'ΠΕΤΣΕΛΗΣ ΧΡΗΣΤΟΣ', personId: 'p1', rawText: 'προήδρευσε ο Αντιπρόεδρος' };
        mockGetSubjectsForMeeting.mockResolvedValue([
            { ...subjectRow({ id: 's1', name: 'Ένα', agendaItemTitle: null, agendaItemIndex: 1 }), decision: { extraction: { presidedBy }, extractorVersion: '4' } },
            subjectRow({ id: 's2', name: 'Δύο', agendaItemTitle: null, agendaItemIndex: 2 }),
        ]);
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        expect(data.councilComposition!.presidedBy).toEqual({ name: 'Πετσέλης Χρήστος', personId: 'p1' });
        expect(data.attendanceChanges).toEqual([
            expect.objectContaining({ personId: 'mayor', type: 'arrival', atSubject: expect.objectContaining({ id: 's2' }) }),
        ]);
        const rollCall = buildRollCall(data.councilComposition!, new Set(data.absentMembers!.map(m => m.personId)), data.administrativeBody?.type ?? null);
        expect(rollCall.president).toMatchObject({
            personId: 'mayor', isMayor: true, printedName: 'Πετσέλης Χρήστος',
            printedNote: 'λόγω απουσίας του ΠΡΟΕΔΡΟΥ, ΔΗΜΑΡΧΟΥ Μαλτέζος Ιωάννης',
        });
        expect(rollCall.absent).toEqual([expect.objectContaining({ member: expect.objectContaining({ personId: 'mayor' }), office: { isMayor: true, feminine: false } })]);
    });

    it("names on each subject's roll call who its own document says presided, else who presided at the meeting", async () => {
        mockGetPeopleForCity.mockResolvedValue([
            person('mayor', 'Ιωάννης Μαλτέζος', [role({ isHead: true, cityId: CITY_ID }), role({ isHead: true, administrativeBodyId: COMMITTEE.id })]),
            person('p1', 'Χρήστος Πετσέλης', [role({ administrativeBodyId: COMMITTEE.id })]),
            person('m1', 'Αντώνης Λιόλιος', [role({ administrativeBodyId: COMMITTEE.id })]),
        ]);
        mockGetMeetingAttendance.mockResolvedValue(['mayor', 'p1', 'm1'].map(personId => ({
            personId, status: personId === 'mayor' ? 'ABSENT' : 'PRESENT',
            person: { name: personId === 'mayor' ? 'Ιωάννης Μαλτέζος' : personId === 'p1' ? 'Χρήστος Πετσέλης' : 'Αντώνης Λιόλιος' },
        })));
        mockAttendanceEventFindMany.mockResolvedValue([]);
        const withPage = (row: ReturnType<typeof subjectRow>, extraction: object) => ({ ...row, decision: { extraction, extractorVersion: '4' } });
        mockGetSubjectsForMeeting.mockResolvedValue([
            withPage(subjectRow({ id: 's1', name: 'Ένα', agendaItemTitle: null, agendaItemIndex: 1 }), { presidedBy: { name: 'ΠΕΤΣΕΛΗΣ ΧΡΗΣΤΟΣ', personId: 'p1' } }),
            withPage(subjectRow({ id: 's2', name: 'Δύο', agendaItemTitle: null, agendaItemIndex: 2 }), {}),
            withPage(subjectRow({ id: 's3', name: 'Τρία', agendaItemTitle: null, agendaItemIndex: 3 }), { presidedBy: { name: 'ΛΙΟΛΙΟΣ ΑΝΤΩΝΗΣ', personId: 'm1' } }),
            subjectRow({ id: 's4', name: 'Τέσσερα', agendaItemTitle: null, agendaItemIndex: 4 }),
        ]);
        const data = await getMinutesData(CITY_ID, MEETING_ID);
        const composition = data.councilComposition!;
        const absentIds = new Set(data.absentMembers!.map(m => m.personId));
        const printedNameAt = (subjectId: string) => buildRollCall(
            composition, absentIds, 'committee', data.subjects.find(s => s.subjectId === subjectId)!.presidedBy,
        ).president!.printedName;

        // The meeting's own line names who the first document says presided.
        expect(composition.presidedBy).toEqual({ name: 'Πετσέλης Χρήστος', personId: 'p1' });
        expect(buildRollCall(composition, absentIds, 'committee').president!.printedName).toBe('Πετσέλης Χρήστος');
        expect(printedNameAt('s1')).toBe('Πετσέλης Χρήστος');
        expect(printedNameAt('s3')).toBe('Λιόλιος Αντώνης');
        // A page that names no one, and a subject with no page, fall back to the meeting's.
        expect(printedNameAt('s2')).toBe('Πετσέλης Χρήστος');
        expect(printedNameAt('s4')).toBe('Πετσέλης Χρήστος');
    });
});
