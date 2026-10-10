/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { CRON_SECRET: 'secret' } }));
jest.mock('@/lib/tasks/pollLivestreams', () => ({
    pollLivestreamsForRecentMeetings: jest.fn().mockResolvedValue({ polled: 0 }),
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/poll-livestreams/route';
import { pollLivestreamsForRecentMeetings } from '@/lib/tasks/pollLivestreams';

const poll = pollLivestreamsForRecentMeetings as jest.Mock;
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
