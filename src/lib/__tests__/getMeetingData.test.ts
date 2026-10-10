/** @jest-environment node */
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeeting: jest.fn() }));
jest.mock('@/lib/db/transcript', () => ({ getTranscript: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({ getCity: jest.fn() }));
jest.mock('@/lib/db/people', () => ({}));
jest.mock('@/lib/db/highlights', () => ({ getHighlightsForMeeting: jest.fn() }));
jest.mock('@/lib/db/sharing/publicContent', () => ({ meetingTranscriptIsPublic: jest.fn() }));
jest.mock('@/lib/db/meetingLifecycle', () => ({ originalScheduledDate: jest.fn() }));
jest.mock('@/lib/db/subject', () => ({}));
jest.mock('@/lib/statistics', () => ({}));
jest.mock('@/lib/db/tasks', () => ({ getMeetingTaskStatus: jest.fn() }));
jest.mock('@/lib/cache', () => ({ createCache: (fn: () => Promise<unknown>) => fn }));
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/cache/queries', () => ({
    getAllCityIdsCached: jest.fn().mockResolvedValue(['athens']),
    getPeopleForCityCached: jest.fn().mockResolvedValue([]),
    getPartiesForCityCached: jest.fn().mockResolvedValue([]),
    getSubjectsForMeetingCached: jest.fn().mockResolvedValue([]),
    getSubjectStatisticsCached: jest.fn().mockResolvedValue({}),
}));

import { getMeetingDataCore } from '@/lib/getMeetingData';
import { getCouncilMeeting } from '@/lib/db/meetings';
import { getTranscript } from '@/lib/db/transcript';
import { getCity } from '@/lib/db/cities';
import { getMeetingTaskStatus } from '@/lib/db/tasks';
import { meetingTranscriptIsPublic } from '@/lib/db/sharing/publicContent';

const transcriptPublic = meetingTranscriptIsPublic as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    (getTranscript as jest.Mock).mockResolvedValue([]);
    (getCity as jest.Mock).mockResolvedValue({ id: 'athens' });
});

describe('getMeetingDataCore transcriptHiddenForReview', () => {
    it('reads the review rule while the meeting is still loading', async () => {
        let resolveMeeting: (value: unknown) => void = () => undefined;
        (getCouncilMeeting as jest.Mock).mockReturnValue(new Promise(resolve => { resolveMeeting = resolve; }));
        (getMeetingTaskStatus as jest.Mock).mockResolvedValue({ humanReview: false });
        transcriptPublic.mockResolvedValue(false);

        const pending = getMeetingDataCore('athens', 'm1');
        await new Promise(resolve => setImmediate(resolve));

        expect(transcriptPublic).toHaveBeenCalledWith('athens', 'm1');
        resolveMeeting({ id: 'm1', administrativeBodyId: 'b1' });
        await expect(pending).resolves.toMatchObject({ transcriptHiddenForReview: true });
    });

    it('shows the transcript that the review rule makes public', async () => {
        (getCouncilMeeting as jest.Mock).mockResolvedValue({ id: 'm2', administrativeBodyId: 'b1' });
        (getMeetingTaskStatus as jest.Mock).mockResolvedValue({ humanReview: true });
        transcriptPublic.mockResolvedValue(true);

        await expect(getMeetingDataCore('athens', 'm2')).resolves.toMatchObject({ transcriptHiddenForReview: false });
    });
});
