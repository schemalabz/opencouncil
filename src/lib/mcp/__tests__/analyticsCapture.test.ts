/** @jest-environment node */

// analytics.ts reads the project token from env.mjs, which jest does not transform.
jest.mock('@/env.mjs', () => ({ env: { NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: 'phc_test' } }));
// auth.ts reaches Prisma.
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));

type Captured = { distinctId: string; event: string; properties: Record<string, unknown> };
const captured: Captured[] = [];
// The PostHog client that @posthog/mcp hands every event to. Recording here
// tests what would leave the server, after our beforeSend.
jest.mock('posthog-node', () => ({
    PostHog: class {
        capture(message: Captured) {
            captured.push(message);
        }
    },
}));

import * as z from 'zod';
import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { instrumentMcpAnalytics } from '@/lib/mcp/analytics';
import type { McpIdentity } from '@/lib/mcp/auth';
import { connectInMemory } from './inMemoryClient';

/**
 * The PostHog MCP SDK wraps the request handlers of a real McpServer, and
 * events reach PostHog through our identify, eventProperties and beforeSend
 * callbacks. Every @posthog/mcp release can change which events it sends and
 * what they carry, so these cases pin what we promise: an authenticated
 * caller's free text and token never leave the server, and the events still
 * name the caller.
 */

const TOKEN = 'mcp_secret_token_value';
const SECRET_ARG = 'draft text about a restricted subject';

function authInfoFor(identity: McpIdentity): AuthInfo {
    return { token: TOKEN, clientId: 'jest', scopes: [], extra: { identity } };
}

function newServer() {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    server.registerTool(
        'echo',
        { description: 'Echo the text back', inputSchema: z.object({ text: z.string() }) },
        async ({ text }) => ({ content: [{ type: 'text' as const, text: `echo: ${text}` }] })
    );
    instrumentMcpAnalytics(server);
    return server;
}

/** Capture is asynchronous after the response; wait until the tool call event lands. */
async function toolCallEvents(): Promise<Captured[]> {
    for (let i = 0; i < 50 && !captured.some(e => e.event === '$mcp_tool_call'); i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    return captured.filter(e => e.event === '$mcp_tool_call');
}

async function callEcho(authInfo?: AuthInfo) {
    const mcp = await connectInMemory(newServer(), { authInfo });
    const result = await mcp.call('echo', { text: SECRET_ARG });
    expect(result.content[0].text).toBe(`echo: ${SECRET_ARG}`);
    const events = await toolCallEvents();
    await mcp.close();
    return events;
}

beforeEach(() => {
    captured.length = 0;
    // The SDK warns on every anonymous request that identify returned null.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('MCP analytics', () => {
    it('keeps the payload of an anonymous tool call and tags it with the realm and host', async () => {
        const [event] = await callEcho();

        expect(event.properties.$mcp_tool_name).toBe('echo');
        expect(event.properties.mcp_authenticated).toBe(false);
        expect(event.properties.realm).toBe('greece');
        expect(event.properties.$host).toBe('opencouncil.gr');
        expect(JSON.stringify(event.properties.$mcp_parameters)).toContain(SECRET_ARG);
    });

    it('names a signed-in user by their user id', async () => {
        const [event] = await callEcho(authInfoFor({ userId: 'user-1' }));

        expect(event.distinctId).toBe('user-1');
        expect(event.properties.mcp_authenticated).toBe(true);
        expect(event.properties.$set).toEqual(expect.objectContaining({ mcp_actor_type: 'user' }));
    });

    it('names a machine account by its user id and owner name', async () => {
        const [event] = await callEcho(authInfoFor({ userId: 'machine-1', machineName: 'Tasks server' }));

        expect(event.distinctId).toBe('machine-1');
        expect(event.properties.$set).toEqual(expect.objectContaining({ mcp_actor_type: 'machine', name: 'Tasks server' }));
    });

    it('sends neither the free text nor the token of an authenticated call, in any event', async () => {
        await callEcho(authInfoFor({ userId: 'user-1' }));

        expect(captured.length).toBeGreaterThan(0);
        for (const event of captured) {
            const payload = JSON.stringify(event);
            expect(payload).not.toContain(SECRET_ARG);
            expect(payload).not.toContain(TOKEN);
        }
    });
});
