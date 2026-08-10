import { instrument } from '@posthog/mcp';
import type { UserIdentity } from '@posthog/mcp';
import { PostHog } from 'posthog-node';
import type { McpServer, AuthInfo } from '@modelcontextprotocol/server';
import { env } from '@/env.mjs';
import type { McpIdentity } from './auth';
import { currentRealm } from './realm-context';

/**
 * PostHog MCP Analytics (https://posthog.com/docs/mcp-analytics): captures
 * $mcp_tool_call / $mcp_tools_list / $mcp_initialize events — tool name,
 * parameters, response, duration, errors — plus agent intent via an injected
 * `context` parameter and missing-capability requests via the `get_more_tools`
 * virtual tool. The injected parameters (`context`, `conversation_id`) are
 * stripped by the SDK before our tool handlers run.
 *
 * Uses the same project token as the browser-side analytics, so MCP events
 * land in the same PostHog project; server-side events go straight to the EU
 * ingestion host rather than through the site's /ingest proxy.
 */

const POSTHOG_EU_INGEST = 'https://eu.i.posthog.com';

const globalForPostHog = globalThis as unknown as {
    mcpPostHog: PostHog | undefined;
};

function getPostHogClient(): PostHog | undefined {
    if (!env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return undefined;
    if (!globalForPostHog.mcpPostHog) {
        globalForPostHog.mcpPostHog = new PostHog(env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
            host: POSTHOG_EU_INGEST,
        });
    }
    return globalForPostHog.mcpPostHog;
}

/**
 * The `extra` PostHog hands to identify/eventProperties is the same object the
 * SDK passes to request handlers — at runtime the v2 ServerContext, but typed
 * loosely by @posthog/mcp (and not exported). Narrow just the slice we read,
 * mirroring identityFromContext in auth.ts.
 */
function identityFromExtra(extra: unknown): McpIdentity {
    if (!extra || typeof extra !== 'object') return null;
    const http = (extra as { http?: { authInfo?: AuthInfo } }).http;
    const identity = http?.authInfo?.extra?.identity as McpIdentity | undefined;
    return identity ?? null;
}

async function identifyCaller(_request: unknown, extra?: unknown): Promise<UserIdentity | null> {
    const identity = identityFromExtra(extra);
    if (!identity) return null;
    if (identity.type === 'user') {
        // Same distinct id the browser uses (session.user.id), so a person's
        // MCP activity merges with their site activity.
        return { distinctId: identity.userId, properties: { mcp_actor_type: 'user' } };
    }
    return {
        distinctId: `service:${identity.keyName}`,
        properties: { mcp_actor_type: 'service' },
    };
}

/**
 * Instrument an MCP server instance with PostHog analytics. No-op when the
 * PostHog token is unset (e.g. local dev). Must run after tools are
 * registered — the SDK wraps the request handlers the registrations create.
 *
 * Compatibility notes — @posthog/mcp targets the legacy @modelcontextprotocol
 * /sdk and duck-types the server; two things make it work on the v2 SDK here:
 *
 * - It must take the *high-level* McpServer: our serving is stateless (a fresh
 *   instance per HTTP request), and only the high-level path resolves each
 *   call's `context`/`conversation_id` ownership from `_registeredTools` at
 *   call time. The low-level path learns ownership from a tools/list served
 *   earlier on the same instance — which never happens per-request — and then
 *   silently drops intent and conversation correlation.
 * - Its high-level type check requires the v1 `tool()` method, which v2
 *   removed in favor of registerTool(); it only checks existence, so a
 *   throwing shim satisfies it.
 *
 * instrument() is fail-safe: on a compatibility break it warns through
 * `logger` and leaves the server working but uninstrumented.
 */
export function instrumentMcpAnalytics(server: McpServer): void {
    const posthog = getPostHogClient();
    if (!posthog) return;

    const shimmed = server as McpServer & { tool?: () => never };
    if (typeof shimmed.tool !== 'function') {
        shimmed.tool = () => {
            throw new Error('tool() is a @posthog/mcp compatibility shim; register tools with registerTool()');
        };
    }

    instrument(server, posthog, {
        context: true,
        reportMissing: true,
        enableConversationId: true,
        // No $exception sibling events: they carry error messages and stack
        // traces that beforeSend cannot attribute to a caller (they skip the
        // custom properties, so the mcp_authenticated mark never reaches
        // them). Errors are already tracked via server logs; the tool-call
        // event keeps $mcp_is_error / $mcp_error_type either way.
        enableExceptionAutocapture: false,
        identify: identifyCaller,
        eventProperties: (_request: unknown, extra?: unknown) => ({
            realm: currentRealm(),
            // Marks events whose payloads beforeSend must scrub (below).
            mcp_authenticated: identityFromExtra(extra) !== null,
        }),
        // Anonymous calls can only ever return public (released) content, so
        // capturing their payloads is safe. Authenticated calls can touch
        // drafts and user-owned highlights, and any of their free text —
        // parameters, responses, even the agent-written intent — may describe
        // that restricted content. Strip all of it; the metadata (tool,
        // duration, errors, realm) still flows. The $identify event embeds the
        // raw request and only fires for authenticated callers, so it is
        // scrubbed unconditionally.
        beforeSend: (event) => {
            if (event.properties?.mcp_authenticated === true || event.event === '$identify') {
                delete event.properties?.$mcp_parameters;
                delete event.properties?.$mcp_response;
                delete event.properties?.$mcp_intent;
                delete event.properties?.$mcp_intent_source;
                // Error text can echo caller input (e.g. "Unknown topic(s):
                // …"); the low-cardinality $mcp_error_type stays.
                delete event.properties?.$mcp_error_message;
            }
            return event;
        },
        // The SDK logs routine info ("Captured PostHog event …") through the
        // same sink as failures; surface only the failures.
        logger: (message: string) => {
            if (/^(warning|error)\b/i.test(message)) {
                console.warn(`[mcp-analytics] ${message}`);
            }
        },
    });
}
