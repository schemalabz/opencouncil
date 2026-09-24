import type { CallToolResult } from '@modelcontextprotocol/server';
import { ApiError } from '@/lib/api/errors';

/** Shared by every file that registers tools: result wrapping and the tool categories. */

function json(data: unknown): CallToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function errorResult(message: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Wrap a tool implementation so ApiErrors surface as readable tool errors and
 * anything unexpected stays generic (no stack traces to clients).
 */
export async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
    try {
        return json(await fn());
    } catch (error) {
        if (error instanceof ApiError) {
            return errorResult(error.message);
        }
        console.error('MCP tool error:', error);
        return errorResult('Internal error');
    }
}

/**
 * Tool grouping, stamped into each tool's `_meta`. Not decorative: the
 * PostHog MCP analytics SDK reads exactly `_meta.category` into
 * $mcp_tool_category, so these strings become analytics dimensions — keep
 * them stable, and keep this union the only place they are defined.
 */
export type ToolCategory = 'discovery' | 'directory' | 'meetings' | 'highlights' | 'admin';
export const category = (category: ToolCategory) => ({ category });
