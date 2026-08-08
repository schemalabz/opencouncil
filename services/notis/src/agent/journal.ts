import { JournalEntry, WakeEvent } from "./types";

/**
 * The journal entry is built deterministically in code, never by the model,
 * so its shape and honesty are testable without a model in the loop.
 */
export function buildJournalEntry(
  event: WakeEvent,
  decision: "silence" | "send",
  rationale: string,
  messages: string[],
  now: Date,
): JournalEntry {
  return {
    at: now.toISOString(),
    event: event.type,
    decision,
    rationale,
    messages,
    // The user's words are conversation memory — they belong to the journal,
    // so the model never has to copy them into the taste profile to keep them.
    ...(event.type === "user_message" ? { received: event.text } : {}),
  };
}
