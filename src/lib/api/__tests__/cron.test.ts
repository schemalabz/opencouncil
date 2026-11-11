/** @jest-environment node */
const mockEnv: { CRON_SECRET?: string } = { CRON_SECRET: 'secret' };
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

import { NextRequest } from 'next/server';
import { cronAuthFailure } from '../cron';

const request = (authorization?: string) => new NextRequest('http://localhost/api/cron/anything', {
    headers: authorization ? { authorization } : {},
});

beforeEach(() => {
    mockEnv.CRON_SECRET = 'secret';
});

describe('cronAuthFailure', () => {
    it('lets through the request with the bearer secret', () => {
        expect(cronAuthFailure(request('Bearer secret'))).toBeNull();
    });

    it.each([undefined, '', 'Bearer wrong', 'secret', 'bearer secret', 'Bearer  secret'])('refuses %p with 401', async (authorization) => {
        const response = cronAuthFailure(request(authorization));
        expect(response?.status).toBe(401);
        expect(await response?.json()).toEqual({ error: 'Unauthorized' });
    });

    it.each([undefined, ''])('refuses every request with 503 when the secret is %p', async (secret) => {
        mockEnv.CRON_SECRET = secret;
        for (const authorization of [undefined, 'Bearer ', 'Bearer undefined', 'Bearer secret']) {
            const response = cronAuthFailure(request(authorization));
            expect(response?.status).toBe(503);
            expect(await response?.json()).toEqual({ error: 'CRON_SECRET not configured' });
        }
    });
});
