import { McpLike } from "@/agent/types";

/**
 * Minimal Streamable-HTTP MCP client for anonymous reads against
 * opencouncil.gr/mcp: initialize once, then tools/call. Responses may come
 * back as JSON or as an SSE stream whose first `message` event carries the
 * JSON-RPC response. No SDK dependency needed for this surface.
 */

interface JsonRpcResponse {
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

async function parseBody(res: Response): Promise<JsonRpcResponse> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    for (const chunk of text.split("\n\n")) {
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!data) continue;
      const parsed = JSON.parse(data) as JsonRpcResponse & { id?: unknown };
      if (parsed.result !== undefined || parsed.error !== undefined) return parsed;
    }
    throw new Error("MCP: SSE stream contained no JSON-RPC response");
  }
  return (await res.json()) as JsonRpcResponse;
}

export class McpClient implements McpLike {
  private sessionId: string | null = null;
  private initialized: Promise<void> | null = null;
  private nextId = 1;

  constructor(private url: string) {}

  private async post(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const res = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body) });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    return res;
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        const res = await this.post({
          jsonrpc: "2.0",
          id: this.nextId++,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "notis", version: "0.1.0" },
          },
        });
        if (!res.ok) throw new Error(`MCP initialize failed: ${res.status}`);
        await parseBody(res);
        const note = await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
        // Consume the (empty) body so the connection isn't pinned until GC.
        await note.text().catch(() => undefined);
      })().catch((e) => {
        this.initialized = null;
        throw e;
      });
    }
    return this.initialized;
  }

  private async postCall(tool: string, args: Record<string, unknown>): Promise<Response> {
    await this.ensureInitialized();
    return this.post({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "tools/call",
      params: { name: tool, arguments: args },
    });
  }

  /**
   * Reset shared session state exactly once per expiry: concurrent 404s all
   * funnel into the first detector's re-init instead of each resetting the
   * singleton under the others' feet (a caller in flight between someone
   * else's reset and re-init would otherwise burn its one retry for nothing).
   */
  private recovering: Promise<void> | null = null;

  private recoverSession(): Promise<void> {
    if (!this.recovering) {
      this.recovering = (async () => {
        this.sessionId = null;
        this.initialized = null;
        await this.ensureInitialized();
      })().finally(() => {
        this.recovering = null;
      });
    }
    return this.recovering;
  }

  async call(tool: string, args: Record<string, unknown>): Promise<unknown> {
    let res = await this.postCall(tool, args);
    if (res.status === 404) {
      // The upstream expired our session (the spec's signal is a 404). This
      // client lives in module-scope singletons, so without recovery one
      // expiry would brick every later call until the process restarts.
      await res.text().catch(() => undefined);
      await this.recoverSession();
      res = await this.postCall(tool, args);
    }
    if (!res.ok) throw new Error(`MCP tools/call ${tool} failed: HTTP ${res.status}`);
    const body = await parseBody(res);
    if (body.error) throw new Error(`MCP ${tool}: ${body.error.message}`);
    if (body.result?.isError) {
      const msg = body.result.content?.map((c) => c.text).join("\n") ?? "unknown tool error";
      throw new Error(`MCP ${tool}: ${msg}`);
    }
    // Parse text blocks individually: the server may append advisory blocks
    // (e.g. the analytics wrapper's "[SERVER]: Reuse conversation_id=…"), and
    // joining them corrupts the JSON. The data block is the first one that
    // parses; a data-less response falls back to the joined plain text.
    const texts = (body.result?.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string);
    if (texts.length === 0) return null;
    for (const text of texts) {
      try {
        return JSON.parse(text);
      } catch {
        // not the data block — keep looking
      }
    }
    return texts.join("\n");
  }
}
