/** @jest-environment node */
const mockGetMeetingSummaryCached = jest.fn();
const mockGetCouncilMeetingsForCityPublicCached = jest.fn();

jest.mock('@/lib/cache', () => ({
    __esModule: true,
    getMeetingSummaryCached: (...args: unknown[]) => mockGetMeetingSummaryCached(...args),
    getCouncilMeetingsForCityPublicCached: (...args: unknown[]) => mockGetCouncilMeetingsForCityPublicCached(...args),
}));

import { getMeetingSummaries } from '@/lib/meetingSummaries';
import type { MeetingSummary } from '@/lib/db/types';

function summary(meetingId: string): MeetingSummary {
    return {
        meeting: {
            id: meetingId,
            cityId: 'vouli',
            name: meetingId,
            name_en: meetingId,
            dateTime: new Date('2026-04-06T10:00:00Z'),
            administrativeBody: null,
            subjects: [],
        },
        durationSeconds: 60,
        speakerCount: 1,
        subjectStartSeconds: {},
    };
}

describe('getMeetingSummaries', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns the requested meeting without consulting the meeting list', async () => {
        mockGetMeetingSummaryCached.mockResolvedValue(summary('m1'));

        const result = await getMeetingSummaries('vouli', { meetingId: 'm1', limit: 3, administrativeBodyIds: ['b1'] });

        expect(result.map(s => s.meeting.id)).toEqual(['m1']);
        expect(mockGetMeetingSummaryCached).toHaveBeenCalledWith('vouli', 'm1');
        expect(mockGetCouncilMeetingsForCityPublicCached).not.toHaveBeenCalled();
    });

    it('yields an empty list for an unknown or unreleased meeting', async () => {
        mockGetMeetingSummaryCached.mockResolvedValue(null);

        expect(await getMeetingSummaries('vouli', { meetingId: 'nope', limit: 1 })).toEqual([]);
    });

    it('takes the latest released past meetings with the body filters, newest first', async () => {
        mockGetCouncilMeetingsForCityPublicCached.mockResolvedValue([{ id: 'm3' }, { id: 'm2' }, { id: 'm1' }]);
        mockGetMeetingSummaryCached.mockImplementation((_cityId: string, meetingId: string) =>
            Promise.resolve(meetingId === 'm2' ? null : summary(meetingId)));

        const result = await getMeetingSummaries('vouli', {
            limit: 3, administrativeBodyTypes: ['council'], administrativeBodyIds: ['b1'],
        });

        expect(mockGetCouncilMeetingsForCityPublicCached).toHaveBeenCalledWith('vouli', {
            limit: 3, administrativeBodyTypes: ['council'], administrativeBodyIds: ['b1'], timeFilter: 'past',
        });
        expect(result.map(s => s.meeting.id)).toEqual(['m3', 'm1']);
    });
});
