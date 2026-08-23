/**
 * Client tools exposed to the model. The core records their invocations into
 * the WakeOutcome and answers with synthetic tool_results — no side effect
 * ever happens inside runWake; the caller applies the outcome.
 */

export const CLIENT_TOOLS = [
  {
    name: "finish_wake",
    description:
      "End the wake, carrying your operator rationale (2-4 honest sentences; 1-2 for " +
      "silence) about why this was, or was not, worth the reader's attention. REQUIRED " +
      "on every wake, and call it in the SAME turn as your final send_message calls — " +
      "one turn: sends plus finish_wake, nothing after.",
    input_schema: {
      type: "object" as const,
      properties: {
        rationale: {
          type: "string",
          description: "The rationale, written for the operator, about the reader — never to them.",
        },
      },
      required: ["rationale"],
    },
  },
  {
    name: "send_message",
    description:
      "Send one WhatsApp message to the reader, in their language (Greek unless they have " +
      "shown otherwise). One specific thing per message; " +
      "two or three sentences is a whole message. Include an opencouncil.gr link. " +
      "Call once per message, in sending order.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The message text, in the reader's language." },
      },
      required: ["text"],
    },
  },
  {
    name: "update_taste_profile",
    description:
      "Rewrite the reader's taste profile. Pass the COMPLETE new profile text — it replaces " +
      "the old one wholesale. Use when they state a preference, or when you learn something " +
      "durable about what they care about.",
    input_schema: {
      type: "object" as const,
      properties: {
        profile: { type: "string", description: "The complete new profile text." },
      },
      required: ["profile"],
    },
  },
  {
    name: "schedule_wakeup",
    description:
      "Wake yourself at a future moment for something NO event will cover — a " +
      "process to recheck, a deadline outside the meeting flow. Never schedule " +
      "for a meeting's aftermath: the published record wakes you automatically " +
      "(meeting_summarized), and your decision log carries any promise you made.",
    input_schema: {
      type: "object" as const,
      properties: {
        at: { type: "string", description: "When to wake, ISO 8601 date or datetime." },
        reason: {
          type: "string",
          description: "What to check when you wake. You will read this note verbatim.",
        },
      },
      required: ["at", "reason"],
    },
  },
  {
    name: "unsubscribe_user",
    description:
      "Unsubscribe the reader from all proactive messages, immediately and permanently " +
      "(until they explicitly resubscribe). Use when they clearly want to leave. " +
      "Warm goodbye first via send_message is welcome; never argue.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: { type: "string", description: "Their words or your one-line summary of why." },
      },
      required: ["reason"],
    },
  },
];

export const MCP_SERVER_NAME = "opencouncil";

/**
 * Anthropic's server-side URL fetcher — how the agent reads a link the reader
 * shares (their personal site, an article on an urban topic). Runs on
 * Anthropic's infrastructure inside the same API call; no fetching code here.
 * The API only permits URLs that already appeared in the conversation (the
 * reader's own message), never model-constructed ones, so the agent cannot be
 * steered into fetching arbitrary addresses. The basic (non-filtering)
 * version keeps code execution out of the request; the content cap bounds a
 * heavy page's token cost (~15k tokens ≈ a very long article).
 */
export const WEB_FETCH_TOOL = {
  type: "web_fetch_20250910",
  name: "web_fetch",
  max_uses: 3,
  max_content_tokens: 15_000,
};

export function buildTools(): unknown[] {
  return [
    { type: "mcp_toolset", mcp_server_name: MCP_SERVER_NAME },
    WEB_FETCH_TOOL,
    ...CLIENT_TOOLS,
  ];
}

export function buildMcpServers(mcpUrl: string): unknown[] {
  return [{ type: "url", name: MCP_SERVER_NAME, url: mcpUrl }];
}
