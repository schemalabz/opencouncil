import type { z } from 'zod';
import type { CallToolResult, StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { ApiError } from '@/lib/api/errors';
import { LifecycleRuleError } from '@/lib/meetingLifecycleRules';
import { jsonSchemaOf } from '@/lib/openapi/jsonSchema';

/** Shared by every file that registers tools: result wrapping and the tool categories. */

function json(data: unknown): CallToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

function errorResult(message: string): CallToolResult {
    return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Wrap a tool implementation so ApiErrors and lifecycle rule errors surface as readable tool errors and
 * anything unexpected stays generic (no stack traces to clients).
 */
export async function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
    try {
        return json(await fn());
    } catch (error) {
        if (error instanceof ApiError) {
            return errorResult(error.message);
        }
        // A broken lifecycle rule of a meeting explains itself, and its code
        // names the rule, as the 422 of the REST API does.
        if (error instanceof LifecycleRuleError) {
            return errorResult(`${error.message} (rule: ${error.code})`);
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

/**
 * A zod schema as a tool input schema. The SDK takes any Standard Schema
 * that also converts to JSON Schema. The JSON Schema comes from jsonSchemaOf,
 * which describes the input of a transform. With this, a tool
 * uses the schema of the route that saves the same data, and cannot drift
 * from it: the SDK validates with it, and the tool list advertises it.
 */
export function toolSchema<T extends z.ZodTypeAny>(schema: T): StandardSchemaWithJSON<z.input<T>, z.output<T>> {
    const jsonSchema = () => jsonSchemaOf(schema);
    return {
        '~standard': { ...schema['~standard'], jsonSchema: { input: jsonSchema, output: jsonSchema } },
    };
}
