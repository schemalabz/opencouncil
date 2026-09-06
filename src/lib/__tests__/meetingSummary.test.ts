/** @jest-environment node */
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: { findUnique: jest.fn() },
        speakerSegment: { aggregate: jest.fn() },
        person: { count: jest.fn() },
        utterance: { groupBy: jest.fn() },
    },
}));

import prisma from '@/lib/db/prisma';
import { getMeetingSummary } from '@/lib/db/meetingSummary';

const mockFindUnique = prisma.councilMeeting.findUnique as jest.MockedFunction<typeof prisma.councilMeeting.findUnique>;
const mockAggregate = prisma.speakerSegment.aggregate as jest.MockedFunction<typeof prisma.speakerSegment.aggregate>;
const mockPersonCount = prisma.person.count as jest.MockedFunction<typeof prisma.person.count>;
const mockGroupBy = prisma.utterance.groupBy as jest.MockedFunction<typeof prisma.utterance.groupBy>;

function subject(id: string, contributions: number) {
    return {
        id,
        name: `Θέμα ${id}`,
        description: 'Περίληψη',
        agendaItemIndex: 1,
        nonAgendaReason: null,
        topic: null,
        _count: { contributions },
    };
}

const MEETING = {
    id: 'apr6_2026',
    cityId: 'vouli',
    name: '25η συνεδρίαση',
    name_en: '25th session',
    dateTime: new Date('2026-04-06T10:00:00Z'),
    administrativeBody: { name: 'Ολομέλεια', name_en: 'Plenary' },
    subjects: [subject('s1', 3), subject('s2', 0)],
};

describe('getMeetingSummary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAggregate.mockResolvedValue({ _min: { startTimestamp: 12 }, _max: { endTimestamp: 13272 } } as never);
        mockPersonCount.mockResolvedValue(28 as never);
        mockGroupBy.mockResolvedValue([
            { discussionSubjectId: 's1', _min: { startTimestamp: 872.5 } },
            { discussionSubjectId: 's2', _min: { startTimestamp: null } },
            { discussionSubjectId: null, _min: { startTimestamp: 5 } },
        ] as never);
    });

    it('reads released meetings only and stops when there is none', async () => {
        mockFindUnique.mockResolvedValue(null as never);

        expect(await getMeetingSummary('vouli', 'missing')).toBeNull();

        expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { cityId_id: { cityId: 'vouli', id: 'missing' }, released: true },
        }));
        expect(mockAggregate).not.toHaveBeenCalled();
        expect(mockPersonCount).not.toHaveBeenCalled();
        expect(mockGroupBy).not.toHaveBeenCalled();
    });

    it('maps the segment span, speaker count and first discussion utterance per subject', async () => {
        mockFindUnique.mockResolvedValue(MEETING as never);

        const summary = await getMeetingSummary('vouli', 'apr6_2026');

        expect(summary).toEqual({
            meeting: MEETING,
            durationSeconds: 13260,
            speakerCount: 28,
            subjectStartSeconds: { s1: 872.5 },
        });
        expect(mockPersonCount).toHaveBeenCalledWith({
            where: { speakerTags: { some: { speakerSegments: { some: { cityId: 'vouli', meetingId: 'apr6_2026' } } } } },
        });
        expect(mockGroupBy).toHaveBeenCalledWith(expect.objectContaining({
            where: { discussionSubjectId: { in: ['s1', 's2'] }, discussionStatus: 'SUBJECT_DISCUSSION' },
        }));
    });

    it('has no duration before transcription', async () => {
        mockFindUnique.mockResolvedValue(MEETING as never);
        mockAggregate.mockResolvedValue({ _min: { startTimestamp: null }, _max: { endTimestamp: null } } as never);
        mockPersonCount.mockResolvedValue(0 as never);
        mockGroupBy.mockResolvedValue([] as never);

        const summary = await getMeetingSummary('vouli', 'apr6_2026');

        expect(summary?.durationSeconds).toBeNull();
        expect(summary?.speakerCount).toBe(0);
        expect(summary?.subjectStartSeconds).toEqual({});
    });

    it('skips the utterance query for a meeting without subjects', async () => {
        mockFindUnique.mockResolvedValue({ ...MEETING, subjects: [] } as never);

        const summary = await getMeetingSummary('vouli', 'apr6_2026');

        expect(mockGroupBy).not.toHaveBeenCalled();
        expect(summary?.subjectStartSeconds).toEqual({});
    });
});
