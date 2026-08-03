import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { registerOpenCouncilServer } from '@/lib/mcp/server';
import { verifyMcpToken } from '@/lib/mcp/auth';
import { MCP_INSTRUCTIONS } from '@/lib/mcp/instructions';

// The public entry points are opencouncil.gr/mcp and opencouncil.gr/mcp/{token}
// (rewritten here by src/proxy.ts). /api/mcp works directly too — useful on
// preview deployments where the proxy adds basic auth.

const baseHandler = createMcpHandler(registerOpenCouncilServer, {
    serverInfo: { name: 'opencouncil', version: '1.0.0' },
    instructions: MCP_INSTRUCTIONS,
});

const authedHandler = withMcpAuth(baseHandler, verifyMcpToken, { required: false });

const TOKEN_SEGMENT = /^(mcp_|sk_)[A-Za-z0-9_-]+$/;

async function handler(
    req: Request,
    { params }: { params: Promise<{ token?: string[] }> }
): Promise<Response> {
    const segments = (await params).token ?? [];

    if (segments.length === 0) {
        return authedHandler(req);
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
        return authedHandler(request);
    }

    return new Response('Not found', { status: 404 });
}

export { handler as GET, handler as POST, handler as DELETE };
