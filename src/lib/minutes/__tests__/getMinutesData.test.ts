/** @jest-environment node */

/**
 * Every place the minutes print a subject name must print the verbatim agenda
 * title when the subject has one (#616): the section name, the "discussed with"
 * cross-reference, the "discussed elsewhere" back-reference, and the
 * cross-subject markers inside the transcript.
 */

const mockGetCouncilMeeting = jest.fn();
const mockGetSubjectsForMeeting = jest.fn();
const mockGetCity = jest.fn();
const mockUtteranceFindMany = jest.fn();

jest.mock('@/lib/db/meetings', () => ({ getCouncilMeeting: (...a: unknown[]) => mockGetCouncilMeeting(...a) }));
jest.mock('@/lib/db/subject', () => ({ getSubjectsForMeeting: (...a: unknown[]) => mockGetSubjectsForMeeting(...a) }));
jest.mock('@/lib/db/cities', () => ({ getCity: (...a: unknown[]) => mockGetCity(...a) }));
jest.mock('@/lib/db/decisions', () => ({
    getExtractedDataForMeeting: jest.fn().mockResolvedValue([]),
    getMeetingAttendance: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/lib/db/people', () => ({ getPeopleForCity: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/sorting/people', () => ({ getElectedOrderForBody: () => null }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { utterance: { findMany: (...a: unknown[]) => mockUtteranceFindMany(...a) } },
}));

import { getMinutesData } from '@/lib/minutes/getMinutesData';
import { MinutesCrossSubjectEntry } from '@/lib/minutes/types';

const CITY_ID = 'city-1';
const MEETING_ID = 'meeting-1';

function subjectRow(o: {
    id: string;
    name: string;
    agendaItemTitle: string | null;
    agendaItemIndex: number;
    discussedIn?: { id: string; name: string; agendaItemTitle: string | null; agendaItemIndex: number };
}) {
    return {
        id: o.id,
        name: o.name,
        agendaItemTitle: o.agendaItemTitle,
        agendaItemIndex: o.agendaItemIndex,
        nonAgendaReason: null,
        withdrawn: false,
        discussedIn: o.discussedIn ?? null,
        decision: null,
        highlights: [],
        contributions: [],
        location: null,
        topic: null,
    };
}

function utterance(o: { id: string; start: number; end: number; subjectId: string }) {
    return {
        id: o.id,
        text: `text ${o.id}`,
        startTimestamp: o.start,
        endTimestamp: o.end,
        discussionSubjectId: o.subjectId,
        discussionStatus: 'DISCUSSED',
        speakerSegment: { speakerTag: { label: 'Ομιλητής', personId: null } },
    };
}

describe('getMinutesData — subject names carry the agenda title', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCity.mockResolvedValue({
            name: 'Χανιά', name_municipality: 'Δήμος Χανίων', timezone: 'Europe/Athens', logoImage: null,
        });
        mockGetCouncilMeeting.mockResolvedValue({
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

        expect(s3.discussedWith).toEqual({ id: 's1', name: 'ΤΙΤΛΟΣ ΕΝΑ', agendaItemIndex: 1 });
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
