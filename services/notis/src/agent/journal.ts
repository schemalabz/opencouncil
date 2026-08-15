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
  extras: { profileRewritten?: boolean; unsubscribed?: boolean; truncated?: boolean } = {},
): JournalEntry {
  return {
    // The event's time, not the wall clock: the journal lives on the world's
    // timeline. Under simulation the two diverge wildly, and a journal dated
    // "in the future" relative to <current_time> wrecks the model's sense of
    // what has already been said.
    at: event.at,
    event: event.type,
    decision,
    rationale,
    messages,
    // The user's words are conversation memory — they belong to the journal,
    // so the model never has to copy them into the taste profile to keep them.
    ...(event.type === "user_message" ? { received: event.text } : {}),
    // The agent's own memory changes are events too: without these markers a
    // future wake cannot see that a rewrite or an unsubscribe ever happened.
    ...(extras.profileRewritten ? { profileRewritten: true } : {}),
    ...(extras.unsubscribed ? { unsubscribed: true } : {}),
    ...(extras.truncated ? { truncated: true } : {}),
  };
}
