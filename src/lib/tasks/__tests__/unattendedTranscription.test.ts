/** @jest-environment node */

const mockMeetingFindMany = jest.fn();
const mockTaskFindMany = jest.fn();
const mockRequestTranscribeInternal = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: { findMany: (...args: unknown[]) => mockMeetingFindMany(...args) },
        taskStatus: { findMany: (...args: unknown[]) => mockTaskFindMany(...args) },
    },
}));
jest.mock('../transcribeInternal', () => ({ requestTranscribeInternal: (...args: unknown[]) => mockRequestTranscribeInternal(...args) }));

import { MAX_UNATTENDED_ATTEMPTS, UNATTENDED_START_DELAY_MS, UNATTENDED_WINDOW_MS, transcribeUnattendedMeetings } from '../unattendedTranscription';

const NOW = new Date('2026-10-09T20:00:00Z');
const youth = (id: string) => ({ id, cityId: 'chania', youtubeUrl: `https://youtu.be/${id}`, administrativeBody: { type: 'youthCouncil' } });
const failed = (id: string, n: number) => Array.from({ length: n }, () => ({ councilMeetingId: id, cityId: 'chania' }));

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTaskFindMany.mockResolvedValue([]);
    mockRequestTranscribeInternal.mockResolvedValue(undefined);
});

describe('transcribeUnattendedMeetings', () => {
    it('asks for the meetings of the secondary bodies that are over, with a recording that takes place', async () => {
        mockMeetingFindMany.mockResolvedValue([]);

        await transcribeUnattendedMeetings({ now: NOW });

        const where = mockMeetingFindMany.mock.calls[0][0].where;
        expect(where.dateTime).toEqual({
            gte: new Date(NOW.getTime() - UNATTENDED_WINDOW_MS),
            lte: new Date(NOW.getTime() - UNATTENDED_START_DELAY_MS),
        });
        expect(where.youtubeUrl).toEqual({ not: null });
        expect(where.administrativeBody).toEqual({ type: { in: ['youthCouncil'] } });
        expect(where).toMatchObject({ scheduleStatus: { in: ['scheduled'] }, noRecording: false });
        // A meeting whose transcription runs or succeeded stays out of the
        // window, so it cannot fill the window and starve a later meeting.
        expect(where.taskStatuses).toEqual({ none: { type: 'transcribe', status: { in: ['pending', 'processing', 'running', 'succeeded'] } } });
        expect(mockTaskFindMany).not.toHaveBeenCalled();
    });

    it('starts the transcription of every meeting the query returns, and counts only the failed attempts', async () => {
        mockMeetingFindMany.mockResolvedValue([youth('m1'), youth('m2')]);

        const summary = await transcribeUnattendedMeetings({ now: NOW });

        expect(mockTaskFindMany.mock.calls[0][0].where).toEqual({ councilMeetingId: { in: ['m1', 'm2'] }, type: 'transcribe', status: 'failed' });
        expect(mockRequestTranscribeInternal).toHaveBeenCalledTimes(2);
        expect(mockRequestTranscribeInternal).toHaveBeenCalledWith('https://youtu.be/m1', 'm1', 'chania');
        expect(summary).toMatchObject({ candidates: 2, triggered: 2, exhausted: 0, errors: 0 });
        expect(summary.results[0]).toEqual({ cityId: 'chania', meetingId: 'm1', action: 'transcribe_triggered' });
    });

    it('retries a failed attempt up to the cap, then stops', async () => {
        mockMeetingFindMany.mockResolvedValue([youth('m1'), youth('m2')]);
        mockTaskFindMany.mockResolvedValue([...failed('m1', MAX_UNATTENDED_ATTEMPTS - 1), ...failed('m2', MAX_UNATTENDED_ATTEMPTS)]);

        const summary = await transcribeUnattendedMeetings({ now: NOW });

        expect(mockRequestTranscribeInternal).toHaveBeenCalledTimes(1);
        expect(mockRequestTranscribeInternal).toHaveBeenCalledWith('https://youtu.be/m1', 'm1', 'chania');
        expect(summary.results).toContainEqual({ cityId: 'chania', meetingId: 'm2', action: 'exhausted' });
    });

    it('records a refusal as an error and goes on with the next meeting', async () => {
        mockMeetingFindMany.mockResolvedValue([youth('m1'), youth('m2')]);
        mockRequestTranscribeInternal.mockRejectedValueOnce(new Error('The meeting already has a transcript.'));

        const summary = await transcribeUnattendedMeetings({ now: NOW });

        expect(summary).toMatchObject({ triggered: 1, errors: 1 });
        expect(summary.results[0]).toMatchObject({ meetingId: 'm1', action: 'error', error: 'The meeting already has a transcript.' });
    });

    it('starts nothing on a dry run, and ignores a row of a primary body whatever the query returned', async () => {
        mockMeetingFindMany.mockResolvedValue([youth('m1'), { ...youth('m2'), administrativeBody: { type: 'council' } }]);

        const summary = await transcribeUnattendedMeetings({ now: NOW, dryRun: true });

        expect(mockRequestTranscribeInternal).not.toHaveBeenCalled();
        expect(summary.results).toEqual([{ cityId: 'chania', meetingId: 'm1', action: 'dry_run' }]);
    });
});
