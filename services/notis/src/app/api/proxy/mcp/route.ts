import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env.mjs";
import { errorResponse, parseJsonBody } from "@/lib/api";
import { McpClient } from "@/lib/mcp-client";

/**
 * Browser-facing pass-through to the public OpenCouncil MCP (CORS-avoiding).
 * Read-only tools the playground needs; nothing else is reachable.
 */
const ALLOWED_TOOLS = new Set(["list_cities", "list_meetings", "get_city", "get_meeting"]);

const requestSchema = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
});

const mcp = new McpClient(env.NOTIS_MCP_URL);

export async function POST(request: NextRequest) {
  const { data, error } = await parseJsonBody(request, requestSchema);
  if (error) return error;
  if (!ALLOWED_TOOLS.has(data.tool)) {
    return NextResponse.json({ error: `tool not allowed: ${data.tool}` }, { status: 403 });
  }
  try {
    const result = await mcp.call(data.tool, data.args);
    return NextResponse.json({ result });
  } catch (e) {
    return errorResponse(e);
  }
}
