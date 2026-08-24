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
        // Asking makes the model consider it. Prompt text alone told it to
        // record what a reader reveals and moved a live eval from 0/6 to
        // ~1/5: readers reveal far more than they declare, and the wake
        // ends before anyone thinks about it. A required answer forces the
        // thought, and the shell nudges once when the answer is yes but
        // update_taste_profile was never called.
        learnedSomethingLasting: {
          type: "boolean",
          description:
            "Did this wake teach you something lasting about the reader — what they " +
            "chase, where they live or work, how they want to be written to? Their " +
            "questions and corrections count, not only what they declare. Answer " +
            "honestly; if true, call update_taste_profile before finishing.",
        },
        // Same reason as the field above: the wake ends before anyone thinks
        // about it. A promise lives in no other row, and the decision log that
        // mentions it in passing rolls out of view within days.
        promisedFollowUp: {
          type: "boolean",
          description:
            "Did you tell the reader you would come back to them about something — " +
            "«θα σου πω», «το κρατάω», «θα σε ενημερώσω»? Answer honestly; if true, " +
            "call record_commitment before finishing, or the promise is forgotten.",
        },
      },
      required: ["rationale", "learnedSomethingLasting", "promisedFollowUp"],
    },
  },
  {
    name: "record_commitment",
    description:
      "Remember something you owe this reader — a follow-up you promised, an update " +
      "they asked you to watch for. It stays in front of you on every future wake, " +
      "however long the conversation gets, until you resolve it. Use it whenever you " +
      "tell them you will come back to them.",
    input_schema: {
      type: "object" as const,
      properties: {
        slug: {
          type: "string",
          description:
            "A short stable handle in lowercase latin letters and hyphens, e.g. " +
            "\"exarcheia-metro\" or \"kipos-road\". You address the commitment by this " +
            "later. Reusing an existing slug replaces what it says.",
        },
        what: {
          type: "string",
          description:
            "One sentence in Greek: what you will tell them, and what has to happen " +
            "first. Written for you, not for them.",
        },
      },
      required: ["slug", "what"],
    },
  },
  {
    name: "resolve_commitment",
    description:
      "Close a commitment by its slug — you delivered on it, or the reader no longer " +
      "wants it. It leaves your list immediately. Say which of the two happened in " +
      "your rationale.",
    input_schema: {
      type: "object" as const,
      properties: {
        slug: { type: "string", description: "The slug of the commitment to close." },
      },
      required: ["slug"],
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
