import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { McpClient } from "@/lib/mcp-client";
import { DEFAULT_CONFIG } from "@/agent/types";

/**
 * Browser-facing pass-through to the public OpenCouncil MCP (CORS-avoiding).
 * Read-only tools the playground needs; nothing else is reachable.
 */
const ALLOWED_TOOLS = new Set(["list_cities", "list_meetings", "get_city", "get_meeting"]);

const requestSchema = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
});

const mcp = new McpClient(DEFAULT_CONFIG.mcpUrl);

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  if (!ALLOWED_TOOLS.has(parsed.data.tool)) {
    return NextResponse.json({ error: `tool not allowed: ${parsed.data.tool}` }, { status: 403 });
  }
  try {
    const result = await mcp.call(parsed.data.tool, parsed.data.args);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "mcp call failed" },
      { status: 502 },
    );
  }
}
