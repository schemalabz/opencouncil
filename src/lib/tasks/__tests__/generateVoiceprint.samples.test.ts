/** @jest-environment node */

import type { SpeakerSegment } from '@prisma/client';

const mockPersonFindUnique = jest.fn();
const mockPersonFindMany = jest.fn();
const mockMeetingFindMany = jest.fn();
const mockStartTask = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        person: {
            findUnique: (...args: unknown[]) => mockPersonFindUnique(...args),
            findMany: (...args: unknown[]) => mockPersonFindMany(...args),
        },
        councilMeeting: { findMany: (...args: unknown[]) => mockMeetingFindMany(...args) },
    },
}));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn().mockResolvedValue(true) }));
jest.mock('../tasks', () => ({ startTask: (...args: unknown[]) => mockStartTask(...args) }));
jest.mock('@/lib/db/voicePrintConsentRule', () => ({
    ...jest.requireActual('@/lib/db/voicePrintConsentRule'),
    hasVoicePrintConsent: jest.fn().mockResolvedValue(true),
}));

import { getVoiceprintSamples, orderVoiceprintSources, requestGenerateVoiceprint, requestGenerateVoiceprintsForCity } from '../generateVoiceprint';

const TAG_CREATED_AT = new Date('2026-10-01T12:00:00Z');

function segment(id: string, meetingId: string, startTimestamp: number, endTimestamp: number): SpeakerSegment {
    return { id, meetingId, cityId: 'athens', startTimestamp, endTimestamp } as SpeakerSegment;
}

/** A person whose tags hold these segments; `personSetBy` decides whether they are voiceprint sources. */
/** A meeting row as the sample query selects it; no audio and no video means no media. */
function meeting(id: string, audioUrl: string | null) {
    return { id, cityId: 'athens', audioUrl, videoUrl: null, name: `Meeting ${id}`, dateTime: new Date('2026-09-21T15:00:00Z'), city: { timezone: 'Europe/Athens' } };
}

function personWith(segments: SpeakerSegment[], personSetBy: string = 'user', reviewedAt: Date[] = []) {
    return {
        id: 'p1',
        speakerTags: [{
            personSetBy,
            createdAt: TAG_CREATED_AT,
            speakerSegments: segments.map(s => ({ ...s, meeting: { taskStatuses: reviewedAt.map(createdAt => ({ createdAt })) } })),
        }],
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('orderVoiceprintSources', () => {
    it('puts each meeting\'s longest segment before any meeting\'s second longest', () => {
        const ordered = orderVoiceprintSources([
            segment('a2', 'A', 0, 60),
            segment('a1', 'A', 0, 300),
            segment('b1', 'B', 0, 120),
            segment('a3', 'A', 0, 40),
            segment('c1', 'C', 0, 90),
            segment('b2', 'B', 0, 50),
        ]);

        expect(ordered.map(s => s.id)).toEqual(['a1', 'b1', 'c1', 'a2', 'b2', 'a3']);
    });

    it('moves to another meeting before it takes a meeting\'s second segment, even when that one is longer', () => {
        const ordered = orderVoiceprintSources([
            segment('a1', 'A', 0, 300),
            segment('a2', 'A', 0, 200),
            segment('b1', 'B', 0, 100),
        ]);

        expect(ordered.map(s => s.id)).toEqual(['a1', 'b1', 'a2']);
    });

    it('tells apart two meetings with the same id in two cities', () => {
        const inCity = (id: string, cityId: string, seconds: number) => ({ ...segment(id, 'm1', 0, seconds), cityId }) as SpeakerSegment;
        const ordered = orderVoiceprintSources([inCity('athens-1', 'athens', 300), inCity('athens-2', 'athens', 200), inCity('chania-1', 'chania', 100)]);

        expect(ordered.map(s => s.id)).toEqual(['athens-1', 'chania-1', 'athens-2']);
    });
});

describe('getVoiceprintSamples', () => {
    it('gives the window each source would be cut from, on the meeting media, longest first', async () => {
        mockPersonFindUnique.mockResolvedValue(personWith([
            segment('short', 'A', 0, 20),
            segment('long', 'A', 100, 200),
            segment('other', 'B', 0, 40),
        ]));
        mockMeetingFindMany.mockResolvedValue([
            { id: 'A', cityId: 'athens', audioUrl: 'https://cdn/a.mp3', videoUrl: null, name: 'Meeting A', dateTime: new Date('2026-09-21T15:00:00Z'), city: { timezone: 'Europe/Athens' } },
            { id: 'B', cityId: 'athens', audioUrl: null, videoUrl: 'https://cdn/b.mp4', name: 'Meeting B', dateTime: new Date('2026-10-19T15:00:00Z'), city: { timezone: 'Europe/Athens' } },
        ]);

        const samples = await getVoiceprintSamples('p1');

        expect(samples).toEqual([
            expect.objectContaining({ segmentId: 'long', mediaUrl: 'https://cdn/a.mp3', startTimestamp: 135, endTimestamp: 165 }),
            expect.objectContaining({ segmentId: 'other', mediaUrl: 'https://cdn/b.mp4', startTimestamp: 5, endTimestamp: 35 }),
        ]);
        expect(samples[0].meetingName).toContain('Meeting A');
    });

    it('leaves out the sources whose meeting has no media, before it caps the samples at ten', async () => {
        const silent = Array.from({ length: 10 }, (_, i) => segment(`silent-${i}`, `S${i}`, 0, 100));
        mockPersonFindUnique.mockResolvedValue(personWith([...silent, segment('heard', 'H', 0, 40)]));
        mockMeetingFindMany.mockResolvedValue([
            ...silent.map(s => ({ id: s.meetingId, cityId: 'athens', audioUrl: null, videoUrl: null, name: s.meetingId, dateTime: new Date('2026-09-21T15:00:00Z'), city: { timezone: 'Europe/Athens' } })),
            { id: 'H', cityId: 'athens', audioUrl: 'https://cdn/h.mp3', videoUrl: null, name: 'H', dateTime: new Date('2026-09-21T15:00:00Z'), city: { timezone: 'Europe/Athens' } },
        ]);

        await expect(getVoiceprintSamples('p1')).resolves.toEqual([expect.objectContaining({ segmentId: 'heard' })]);
    });

    it('leaves out a name only the transcript gave, until a review of its meeting completes', async () => {
        mockPersonFindUnique.mockResolvedValue(personWith([segment('s1', 'A', 0, 60)], 'transcript'));

        await expect(getVoiceprintSamples('p1')).resolves.toEqual([]);
        expect(mockMeetingFindMany).not.toHaveBeenCalled();
    });
});

describe('requestGenerateVoiceprint with the chosen sample', () => {
    beforeEach(() => {
        mockStartTask.mockResolvedValue({ id: 'task-1' });
    });

    it('starts the task on the window of the chosen segment, not of the longest', async () => {
        mockPersonFindUnique
            .mockResolvedValueOnce({ id: 'p1', roles: [], voicePrintConsents: [], administrators: [] })
            .mockResolvedValueOnce(personWith([segment('longest', 'A', 0, 300), segment('chosen', 'B', 100, 160)]));
        mockMeetingFindMany.mockResolvedValue([meeting('A', 'https://cdn/a.mp3'), meeting('B', 'https://cdn/b.mp3')]);

        await expect(requestGenerateVoiceprint('p1', 'chosen')).resolves.toEqual({ ok: true, task: { id: 'task-1' } });
        expect(mockStartTask).toHaveBeenCalledWith(
            'generateVoiceprint',
            expect.objectContaining({ segmentId: 'chosen', startTimestamp: 115, endTimestamp: 145, mediaUrl: 'https://cdn/b.mp3' }),
            'B',
            'athens',
        );
    });

    it('refuses, as a value, a segment that is not one of the person\'s sources', async () => {
        mockPersonFindUnique
            .mockResolvedValueOnce({ id: 'p1', roles: [], voicePrintConsents: [], administrators: [] })
            .mockResolvedValueOnce(personWith([segment('s1', 'A', 0, 20)]));

        await expect(requestGenerateVoiceprint('p1', 's1')).resolves.toEqual({
            ok: false,
            message: expect.stringContaining('cannot become the person\'s voiceprint'),
        });
        expect(mockStartTask).not.toHaveBeenCalled();
    });
});

describe('requestGenerateVoiceprintsForCity', () => {
    it('uses the longest source whose meeting has media, as the dialog\'s first sample', async () => {
        mockPersonFindMany.mockResolvedValue([{ ...personWith([segment('silent', 'A', 0, 300), segment('heard', 'B', 0, 60)]), name: 'Speaker', roles: [], voicePrintConsents: [], administrators: [] }]);
        mockPersonFindUnique.mockResolvedValue(personWith([segment('silent', 'A', 0, 300), segment('heard', 'B', 0, 60)]));
        mockMeetingFindMany.mockResolvedValue([meeting('A', null), meeting('B', 'https://cdn/b.mp3')]);
        mockStartTask.mockResolvedValue({ id: 'task-1' });

        await expect(requestGenerateVoiceprintsForCity('athens', ['p1'])).resolves.toEqual(expect.objectContaining({ successful: 1, failed: 0 }));
        expect(mockStartTask).toHaveBeenCalledWith('generateVoiceprint', expect.objectContaining({ segmentId: 'heard' }), 'B', 'athens');
    });
});
