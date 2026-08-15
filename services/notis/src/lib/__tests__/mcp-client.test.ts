import { McpClient } from "../mcp-client";

/**
 * Regression tests for the two production failure modes of the MCP client:
 * advisory text blocks corrupting the JSON parse, and session-expiry
 * recovery racing under concurrency.
 */

type FetchCall = { body: Record<string, unknown> };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "mcp-session-id": "s1" },
  });
}

function toolResult(content: Array<{ type: string; text?: string }>): unknown {
  return { jsonrpc: "2.0", id: 1, result: { content } };
}

const INIT_OK = { jsonrpc: "2.0", id: 0, result: { capabilities: {} } };

function mockFetch(handler: (call: FetchCall, index: number) => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  global.fetch = jest.fn(async (_url, init) => {
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    const call = { body };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return calls;
}

function respondByMethod(onToolCall: () => Response) {
  return (call: FetchCall): Response => {
    if (call.body.method === "initialize") return jsonResponse(INIT_OK);
    if (call.body.method === "notifications/initialized") return new Response("", { status: 202 });
    return onToolCall();
  };
}

describe("McpClient content parsing", () => {
  it("returns the JSON data block even when the server appends advisory text", async () => {
    mockFetch(
      respondByMethod(() =>
        jsonResponse(
          toolResult([
            { type: "text", text: '{"meetings":[{"id":"m1"}]}' },
            { type: "text", text: "[SERVER]: Reuse conversation_id=abc on subsequent calls" },
          ]),
        ),
      ),
    );
    const client = new McpClient("http://mcp.test");
    await expect(client.call("list_meetings", {})).resolves.toEqual({
      meetings: [{ id: "m1" }],
    });
  });

  it("finds the data block regardless of its position", async () => {
    mockFetch(
      respondByMethod(() =>
        jsonResponse(
          toolResult([
            { type: "text", text: "[SERVER]: advisory first" },
            { type: "text", text: '{"ok":true}' },
          ]),
        ),
      ),
    );
    const client = new McpClient("http://mcp.test");
    await expect(client.call("get_city", {})).resolves.toEqual({ ok: true });
  });

  it("falls back to joined plain text when no block is JSON", async () => {
    mockFetch(
      respondByMethod(() =>
        jsonResponse(toolResult([{ type: "text", text: "plain answer" }])),
      ),
    );
    const client = new McpClient("http://mcp.test");
    await expect(client.call("get_city", {})).resolves.toBe("plain answer");
  });
});

describe("McpClient session recovery", () => {
  it("re-initializes once and retries when the session expires", async () => {
    let toolCalls = 0;
    const calls = mockFetch(
      respondByMethod(() => {
        toolCalls += 1;
        if (toolCalls === 1) return new Response("", { status: 404 });
        return jsonResponse(toolResult([{ type: "text", text: '{"ok":true}' }]));
      }),
    );
    const client = new McpClient("http://mcp.test");
    await expect(client.call("get_city", {})).resolves.toEqual({ ok: true });
    const inits = calls.filter((c) => c.body.method === "initialize");
    expect(inits).toHaveLength(2); // initial + one recovery
  });

  it("funnels concurrent expiries into a single re-initialization", async () => {
    let toolCalls = 0;
    const calls = mockFetch(
      respondByMethod(() => {
        toolCalls += 1;
        // The first two tool calls hit the expired session together.
        if (toolCalls <= 2) return new Response("", { status: 404 });
        return jsonResponse(toolResult([{ type: "text", text: '{"ok":true}' }]));
      }),
    );
    const client = new McpClient("http://mcp.test");
    const [a, b] = await Promise.all([client.call("get_city", {}), client.call("get_city", {})]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    const inits = calls.filter((c) => c.body.method === "initialize");
    expect(inits).toHaveLength(2); // initial + ONE shared recovery, not two
  });
});
