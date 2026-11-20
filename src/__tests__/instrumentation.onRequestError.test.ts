/** @jest-environment node */
const mockSendErrorAdminAlert = jest.fn();
jest.mock('@/lib/discord-core', () => ({ sendErrorAdminAlert: (...args: unknown[]) => mockSendErrorAdminAlert(...args) }));

import { format } from 'node:util';
import { onRequestError } from '@/instrumentation';

const CANARY_ADDRESS = 'Οδός Καναρινιού 7';
const CANARY_TOKEN = 'canary-claim-token';

describe('onRequestError', () => {
    it('logs and alerts the route, the path and the error, without the query string or the token in the path', async () => {
        const lines: string[] = [];
        const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { lines.push(format(...args)); });
        mockSendErrorAdminAlert.mockResolvedValue(undefined);

        await onRequestError(
            new Error('claim lookup failed'),
            { path: `/api/join/${CANARY_TOKEN}?q=${encodeURIComponent(CANARY_ADDRESS)}`, method: 'GET', headers: { host: 'opencouncil.gr' } },
            { routerKind: 'App Router', routePath: '/api/join/[token]', routeType: 'route', revalidateReason: undefined },
        );
        spy.mockRestore();

        const logged = lines.join('\n');
        const alerted = JSON.stringify(mockSendErrorAdminAlert.mock.calls);
        expect(logged).toContain('[onRequestError] route /api/join/[token] (GET /api/join/[redacted]):');
        expect(logged).toContain('Error: claim lookup failed');
        expect(mockSendErrorAdminAlert).toHaveBeenCalledWith(expect.objectContaining({
            context: expect.objectContaining({ url: 'GET /api/join/[redacted]', route: '/api/join/[token]' }),
        }));
        for (const canary of [CANARY_ADDRESS, encodeURIComponent(CANARY_ADDRESS), CANARY_TOKEN]) {
            expect(logged).not.toContain(canary);
            expect(alerted).not.toContain(canary);
        }
    });
});
