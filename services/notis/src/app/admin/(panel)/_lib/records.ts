import { TemplateName } from "@/agent/templates";
import { WakeEvent, WakeOutcome } from "@/agent/types";

/**
 * The neutral "one wake" record that every admin inspection surface renders —
 * the playground's simulated queue and (PR 2+) real conversations replayed
 * from the database both project into this shape. Simulator-only states
 * (pending briefs, skipped items) simply never occur in real records.
 */

/** City display metadata for timelines and hover cards, keyed by cityId. */
export type CityMeta = Record<string, { name: string; logo?: string | null }>;

/**
 * How a reader entered Notis — decides the intro template shell. An
 * `inbound` thread opens with the reader's own message; it has no intro.
 */
export type Origin = "transition" | "signup" | "inbound";

/** A queue item whose meeting brief may not be generated yet (playground-only). */
export type PendingBrief = { pending: true };

export type RecordEvent =
  | WakeEvent
  | {
      type: "agenda_processed" | "meeting_summarized";
      at: string;
      cityId: string;
      meetingId: string;
      meetingName: string;
      meetingDate: string;
      adminBody?: string | null;
      brief: PendingBrief;
    }
  // A shell-side decision with no wake event behind it (e.g. the poller's
  // phone-gone unsubscribe) — rendered as a silence chip in the thread.
  | { type: "system"; at: string };

/** Real delivery lifecycle of one outbound message (DB-backed viewer only). */
export interface MessageDelivery {
  /**
   * When the message row was written — which is when it went out, not when
   * the wake that produced it was triggered. The thread sorts and stamps on
   * this, because a wake can take a minute and anything the reader did during
   * it belongs in between. Absent in the playground (no real rows).
   */
  at?: string;
  status: "pending" | "sent" | "delivered" | "read" | "failed" | "suppressed" | null;
  failureReason?: string | null;
  /** A notify-only SMS went out after this WhatsApp send failed. */
  smsFallback?: boolean;
}

export interface WakeRecord {
  id: string;
  event: RecordEvent;
  status: "pending" | "done" | "skipped";
  outcome?: WakeOutcome;
  traceRef?: string;
  /**
   * How the outcome's messages were (or would be) delivered on WhatsApp:
   * outside the 24h window each message rides a template shell; inside it,
   * free-form.
   */
  delivery?: { mode: "template"; template: TemplateName } | { mode: "freeform" };
  /**
   * Per-message delivery status, index-aligned with outcome.messages.
   * Absent in the playground — the simulator has no real deliveries.
   */
  deliveries?: MessageDelivery[];
  /** Number of events this wake consumed at once; absent for the common
   *  single-event wake. */
  coalesced?: number;
}

export function hasPendingBrief(
  event: RecordEvent,
): event is Extract<RecordEvent, { brief: PendingBrief }> {
  return (
    (event.type === "agenda_processed" || event.type === "meeting_summarized") &&
    "brief" in event &&
    typeof event.brief === "object" &&
    event.brief !== null &&
    "pending" in event.brief
  );
}

/** Greek display labels for wake event types, shared by the overview, the
 *  wakes feed and the system page. */
export const EVENT_LABELS: Record<string, string> = {
  user_message: "μηνύματα χρηστών",
  agenda_processed: "ατζέντες",
  meeting_summarized: "απολογισμοί",
  scheduled: "προγραμματισμένα",
  heartbeat: "heartbeat",
  system: "σύστημα",
};
