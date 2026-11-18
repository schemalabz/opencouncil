/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { CRON_SECRET: 'secret' } }));
jest.mock('@/lib/tasks/pollLivestreams', () => ({
    pollLivestreamsForRecentMeetings: jest.fn().mockResolvedValue({ polled: 0 }),
}));
jest.mock('@/lib/tasks/unattendedTranscription', () => ({
    transcribeUnattendedMeetings: jest.fn().mockResolvedValue({ started: 0 }),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/poll-livestreams/route';
import { pollLivestreamsForRecentMeetings } from '@/lib/tasks/pollLivestreams';
import { transcribeUnattendedMeetings } from '@/lib/tasks/unattendedTranscription';

const poll = pollLivestreamsForRecentMeetings as jest.Mock;
const unattended = transcribeUnattendedMeetings as jest.Mock;
const get = (qs: string) => GET(new NextRequest(`http://localhost/api/cron/poll-livestreams${qs}`, {
    headers: { authorization: 'Bearer secret' },
}));

beforeEach(() => jest.clearAllMocks());

describe('GET /api/cron/poll-livestreams dryRun', () => {
    it.each([
        ['', false],
        ['?dryRun=', false],
        ['?dryRun=true', true],
        ['?dryRun=1', true],
        ['?dryRun=false', false],
    ])('reads %p as dryRun %p', async (qs, dryRun) => {
        const response = await get(qs);

        expect(response.status).toBe(200);
        expect(poll).toHaveBeenCalledWith({ dryRun });
    });

    it('answers 400 for a value that is not a boolean and does not poll', async () => {
        const response = await get('?dryRun=maybe');

        expect(response.status).toBe(400);
        expect(poll).not.toHaveBeenCalled();
    });
});

describe('GET /api/cron/poll-livestreams runs its two passes apart', () => {
    beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));

    it('keeps the result of the livestream poll when the unattended pass fails, and answers 500', async () => {
        unattended.mockRejectedValueOnce(new Error('database down'));

        const response = await get('');

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ polled: 0, unattended: { error: 'database down' } });
    });

    it('keeps the result of the unattended pass when the livestream poll fails', async () => {
        poll.mockRejectedValueOnce(new Error('YouTube quota'));

        const response = await get('');

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'YouTube quota', unattended: { started: 0 } });
    });

    it('answers 200 with both results when both passes succeed', async () => {
        const response = await get('');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ polled: 0, unattended: { started: 0 } });
    });
});
