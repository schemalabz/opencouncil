import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { Realm } from '@prisma/client';
import { registerOpenCouncilServer } from '@/lib/mcp/server';
import { instrumentMcpAnalytics } from '@/lib/mcp/analytics';
import { verifyMcpToken } from '@/lib/mcp/auth';
import { MCP_INSTRUCTIONS } from '@/lib/mcp/instructions';
import { mcpRealmStore, requestContext } from '@/lib/mcp/realm-context';
import { getRealm } from '@/lib/realm.server';

// The public entry points are opencouncil.gr/mcp and opencouncil.gr/mcp/{token}
// (rewritten here by src/proxy.ts). /api/mcp works directly too — useful on
// preview deployments where the proxy adds basic auth.

const baseHandler = createMcpHandler(
    (server) => {
        registerOpenCouncilServer(server);
        // After registration: PostHog wraps the request handlers that
        // registering the first tool creates.
        instrumentMcpAnalytics(server);
    },
    {
        serverInfo: { name: 'opencouncil', version: '1.0.0' },
        instructions: MCP_INSTRUCTIONS,
    }
);

const authedHandler = withMcpAuth(baseHandler, verifyMcpToken, { required: false });

const TOKEN_SEGMENT = /^(mcp_|sk_)[A-Za-z0-9_-]+$/;

async function handler(
    req: Request,
    { params }: { params: Promise<{ token?: string[] }> }
): Promise<Response> {
    const segments = (await params).token ?? [];

    // An MCP URL belongs to one realm (opencouncil.gr / .fr / .rs). Resolve it
    // here — the only place guaranteed to be in a request scope — and make it
    // available to every tool below.
    let realm: Realm = Realm.greece;
    try {
        realm = await getRealm();
    } catch {
        // not in a request scope (shouldn't happen in a route handler); keep the default
    }
    const context = requestContext(realm, req.headers.get('host'));
    const withRealm = <T>(fn: () => Promise<T>) => mcpRealmStore.run(context, fn);

    if (segments.length === 0) {
        return withRealm(() => authedHandler(req));
    }

    // /api/mcp/{token}: move the URL-embedded token into the Authorization
    // header (unless the client already sent one) so a single auth path
    // handles both styles.
    if (segments.length === 1 && TOKEN_SEGMENT.test(segments[0])) {
        const headers = new Headers(req.headers);
        if (!headers.has('authorization')) {
            headers.set('authorization', `Bearer ${segments[0]}`);
        }
        const url = new URL(req.url);
        url.pathname = '/api/mcp';
        const request = new Request(url, {
            method: req.method,
            headers,
            body: req.body,
            // Node's fetch requires duplex for streamed request bodies
            duplex: 'half',
        } as RequestInit);
        return withRealm(() => authedHandler(request));
    }

    return new Response('Not found', { status: 404 });
}

export { handler as GET, handler as POST, handler as DELETE };
