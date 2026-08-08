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
    };

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
