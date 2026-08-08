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
  };
}
