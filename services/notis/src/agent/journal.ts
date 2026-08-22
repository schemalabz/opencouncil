import { primaryEvent } from "./schemas";
import { JournalEntry, WakeEvent } from "./types";

/**
 * The journal entry is built deterministically in code, never by the model,
 * so its shape and honesty are testable without a model in the loop.
 *
 * For a coalesced wake: the entry is labeled by the PRIMARY event, dated by
 * the LAST one (the moment the wake actually processed), and `received`
 * keeps the last thing the reader wrote, verbatim.
 */
export function buildJournalEntry(
  events: WakeEvent[],
  decision: "silence" | "send",
  rationale: string,
  messages: string[],
  extras: { profileRewritten?: boolean; unsubscribed?: boolean; truncated?: boolean } = {},
): JournalEntry {
  const primary = primaryEvent(events);
  const userMessages = events.filter(
    (e): e is Extract<WakeEvent, { type: "user_message" }> => e.type === "user_message",
  );
  return {
    // The events' time, not the wall clock: the journal lives on the world's
    // timeline. Under simulation the two diverge wildly, and a journal dated
    // "in the future" relative to <current_time> wrecks the model's sense of
    // what has already been said.
    at: events[events.length - 1].at,
    event: primary.type,
    decision,
    rationale,
    messages,
    // The user's words are conversation memory — they belong to the journal,
    // so the model never has to copy them into the taste profile to keep them.
    ...(userMessages.length > 0
      ? { received: userMessages[userMessages.length - 1].text }
      : {}),
    // The agent's own memory changes are events too: without these markers a
    // future wake cannot see that a rewrite or an unsubscribe ever happened.
    ...(extras.profileRewritten ? { profileRewritten: true } : {}),
    ...(extras.unsubscribed ? { unsubscribed: true } : {}),
    ...(extras.truncated ? { truncated: true } : {}),
  };
}
