/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_test' } }));
jest.mock('posthog-node', () => ({ PostHog: jest.fn().mockImplementation(() => ({})) }));
const mockInstrument = jest.fn();
jest.mock('@posthog/mcp', () => ({ instrument: (...a: unknown[]) => mockInstrument(...a) }));
import type { McpServer } from '@modelcontextprotocol/server';
import { instrumentMcpAnalytics } from '../analytics';
const extraFor = (identity: { userId: string; machineName?: string }) =>
    ({ http: { authInfo: { token: 't', clientId: identity.userId, scopes: [], extra: { identity } } } });
it('names a machine account apart from a person', async () => {
    instrumentMcpAnalytics({} as McpServer);
    const { identify } = mockInstrument.mock.calls[0][2] as { identify: (r: unknown, e: unknown) => Promise<unknown> };
    expect(await identify(null, extraFor({ userId: 'bot-1', machineName: 'Paola' })))
        .toEqual({ distinctId: 'bot-1', properties: { mcp_actor_type: 'machine', name: 'Paola' } });
    expect(await identify(null, extraFor({ userId: 'u1' }))).toEqual({ distinctId: 'u1', properties: { mcp_actor_type: 'user' } });
});
