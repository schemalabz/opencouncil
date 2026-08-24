import { primaryEvent, wakeEventsSchema } from "@/agent/schemas";
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

/**
 * Live queue state carried by a synthesized record (see queueBackedRecords).
 * `attempts` counts claims so far: on a pending row every claim ended in a
 * retryable failure; on a running row the current claim is the attempts-th.
 */
export interface QueueState {
  state: "pending" | "running" | "failed";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  /** Next retry instant — present only on a pending row that failed before. */
  nextTryAt?: string;
}

export interface WakeRecord {
  id: string;
  event: RecordEvent;
  status: "pending" | "done" | "skipped" | "failed";
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
  /** Present only on records synthesized from a live queue row — the wake
   *  has not completed (or never will), so there is no NotisWake behind it. */
  queue?: QueueState;
  /**
   * Every reader message this wake carries, in order — a coalesced or
   * absorbing wake holds several, and the thread must render each as its
   * own bubble (the primary event alone would hide the correction the wake
   * exists to honor). Absent = derive from the primary event.
   */
  readerMessages?: Array<{ at: string; text: string }>;
}

/** All user_message events of a wake, in order, for the thread's bubbles. */
export function readerMessagesOf(events: unknown[]): Array<{ at: string; text: string }> {
  return events
    .filter(
      (e): e is { type: "user_message"; at: string; text: string } =>
        typeof e === "object" &&
        e !== null &&
        (e as { type?: unknown }).type === "user_message" &&
        typeof (e as { text?: unknown }).text === "string" &&
        typeof (e as { at?: unknown }).at === "string",
    )
    .map((e) => ({ at: e.at, text: e.text }));
}

/** The queue-row slice the synthesis needs; matches NotisWakeQueue columns. */
export interface QueueRowLike {
  id: string;
  status: string;
  events: unknown;
  attempts: number;
  lastError: string | null;
  runAfter: Date;
}

/**
 * A wake still sitting in the queue has no NotisWake row, so a thread built
 * from wake records alone hides the reader's message exactly while it is
 * pending or failing — the moment an operator is looking. The queue row
 * itself carries the unconsumed events, so the thread synthesizes a record
 * from it; once the wake completes, the row leaves the queue and the real
 * record takes over.
 */
export function queueBackedRecords(rows: QueueRowLike[], maxAttempts: number): WakeRecord[] {
  const out: WakeRecord[] = [];
  for (const row of rows) {
    const parsed = wakeEventsSchema.safeParse(row.events);
    if (!parsed.success || parsed.data.length === 0) continue;
    const events = parsed.data;
    const state =
      row.status === "failed" ? "failed" : row.status === "running" ? "running" : "pending";
    const readers = readerMessagesOf(events);
    out.push({
      id: `queue:${row.id}`,
      event: primaryEvent(events),
      status: state === "failed" ? "failed" : "pending",
      ...(readers.length > 1 ? { readerMessages: readers } : {}),
      queue: {
        state,
        attempts: row.attempts,
        maxAttempts,
        lastError: row.lastError,
        ...(state === "pending" && row.attempts > 0
          ? { nextTryAt: row.runAfter.toISOString() }
          : {}),
      },
      ...(events.length > 1 ? { coalesced: events.length } : {}),
    });
  }
  return out;
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
