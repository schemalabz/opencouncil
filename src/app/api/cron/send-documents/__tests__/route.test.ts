/** @jest-environment node */
// The cron emails municipal back offices, so its guard and its error path get a unit test.
const mockEnv: { CRON_SECRET?: string } = { CRON_SECRET: 'secret' };
jest.mock('@/env.mjs', () => ({ env: mockEnv }));
const mockSendDue = jest.fn();
jest.mock('@/lib/documents/automatic', () => ({ sendDueDocuments: (...a: unknown[]) => mockSendDue(...a) }));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/send-documents/route';

const get = (authorization?: string) => GET(new NextRequest('http://localhost/api/cron/send-documents', {
    headers: authorization ? { authorization } : {},
}));

const summary = { staleReleased: 0, evaluated: 0, sent: [], failed: [], waiting: 0, notCovered: 0, exhausted: 0 };

beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.CRON_SECRET = 'secret';
    mockSendDue.mockResolvedValue(summary);
});

describe('GET /api/cron/send-documents', () => {
    it('answers 503 and sends nothing when CRON_SECRET is not set, even to a matching header', async () => {
        mockEnv.CRON_SECRET = undefined;
        expect((await get('Bearer undefined')).status).toBe(503);
        expect((await get()).status).toBe(503);
        expect(mockSendDue).not.toHaveBeenCalled();
    });

    it.each([undefined, 'Bearer wrong', 'secret', 'bearer secret'])('answers 401 to %p and sends nothing', async (authorization) => {
        expect((await get(authorization)).status).toBe(401);
        expect(mockSendDue).not.toHaveBeenCalled();
    });

    it('runs the send with the right secret and returns its summary', async () => {
        const response = await get('Bearer secret');
        expect(response.status).toBe(200);
        expect(mockSendDue).toHaveBeenCalledTimes(1);
        expect(await response.json()).toEqual(summary);
    });

    it('answers 500 with the fallback message when the run throws', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        mockSendDue.mockRejectedValue(new Error('db down'));
        const response = await get('Bearer secret');
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to send the due documents' });
    });
});
