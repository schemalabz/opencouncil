import { primaryEvent } from "./schemas";
import { DecisionEntry, WakeEvent, WakeOutcome } from "./types";

/**
 * The decision entry is derived deterministically in code, never by the
 * model. It records what the agent DID — trigger, send or silence, why — and
 * nothing else: the message text lives only in the conversation (the real
 * message record), so there is no copy to correct when a rail stops a send.
 *
 * For a coalesced wake: the entry is labeled by the PRIMARY event and dated
 * by the LAST one (the moment the wake actually processed).
 */
export function buildDecisionEntry(events: WakeEvent[], outcome: WakeOutcome): DecisionEntry {
  const primary = primaryEvent(events);
  return {
    // The events' time, not the wall clock: the decision log lives on the
    // world's timeline. Under simulation the two diverge wildly, and a log
    // dated "in the future" relative to <current_time> wrecks the model's
    // sense of what has already happened.
    at: events[events.length - 1].at,
    event: primary.type,
    decision: outcome.decision,
    rationale: outcome.rationale,
    // The agent's own memory changes are events too: without these markers a
    // future wake cannot see that a rewrite or an unsubscribe ever happened.
    ...(outcome.profileRewrite !== undefined ? { profileRewritten: true } : {}),
    ...(outcome.unsubscribe ? { unsubscribed: true } : {}),
    ...(outcome.truncated ? { truncated: true } : {}),
  };
}
