/**
 * Client tools exposed to the model. The core records their invocations into
 * the WakeOutcome and answers with synthetic tool_results — no side effect
 * ever happens inside runWake; the caller applies the outcome.
 */

export const CLIENT_TOOLS = [
  {
    name: "send_message",
    description:
      "Send one WhatsApp message to the reader, in Greek. One specific thing per message; " +
      "two or three sentences is a whole message. Include an opencouncil.gr link. " +
      "Call once per message, in sending order.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The message text, in Greek." },
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
      "Wake yourself again at a future moment to follow up on an open thread " +
      "(e.g. a decision expected at a coming meeting, an answer you promised).",
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

export function buildTools(): unknown[] {
  return [{ type: "mcp_toolset", mcp_server_name: MCP_SERVER_NAME }, ...CLIENT_TOOLS];
}

export function buildMcpServers(mcpUrl: string): unknown[] {
  return [{ type: "url", name: MCP_SERVER_NAME, url: mcpUrl }];
}
