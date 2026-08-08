import { TemplateName } from "@/agent/templates";
import { WakeEvent, WakeOutcome, WakeState, WakeTrace } from "@/agent/types";

/** A queue item whose meeting brief may not be generated yet (lazy). */
export type PendingBrief = { pending: true };

export type QueueEvent =
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

export interface QueueItem {
  id: string;
  event: QueueEvent;
  status: "pending" | "done" | "skipped";
  outcome?: WakeOutcome;
  traceRef?: string;
  /**
   * How the outcome's messages were (or would be) delivered on WhatsApp:
   * outside the 24h window each message rides a template shell; inside it,
   * free-form. Set by the step pipeline when the wake sends.
   */
  delivery?: { mode: "template"; template: TemplateName } | { mode: "freeform" };
}

export interface SimSettings {
  model?: string;
  maxTurns?: number;
}

/** A geocoded picked address — playground-only; the agent sees just the text. */
export interface LocationPoint {
  text: string;
  lng: number;
  lat: number;
}

export interface Sim {
  state: WakeState;
  clock: string; // ISO simulated now
  queue: QueueItem[];
  cursor: number; // index of the next pending item
  promptOverride?: string;
  settings: SimSettings;
  /** Geocoded coordinates of picked locations, keyed by cityId (for the map). */
  locationPoints?: Record<string, LocationPoint[]>;
  /** How this user entered Notis — decides the intro template. */
  origin: "transition" | "signup";
  /** When the simulated user last wrote (drives the 24h template window). */
  lastUserMessageAt?: string;
  /** Set when a wake called unsubscribe_user — the sim is a zombie after this. */
  unsubscribedAt?: string;
  /** City display metadata for the timeline (name + logo). */
  cityMeta?: Record<string, { name: string; logo?: string | null }>;
}

export interface Snapshot {
  id: string;
  label: string;
  takenAt: string; // simulated clock at snapshot time
  sim: Sim;
}

export interface PlaygroundStore {
  version: 1;
  setup: { done: boolean; from: string };
  sim: Sim;
  traces: Record<string, WakeTrace>;
  traceOrder: string[]; // LRU, oldest first
  snapshots: Snapshot[];
}

export const TRACE_CAP = 20;
export const SNAPSHOT_CAP = 30;
export const STORAGE_KEY = "notis:playground:v1";

export function hasPendingBrief(event: QueueEvent): event is Extract<QueueEvent, { brief: PendingBrief }> {
  return (
    (event.type === "agenda_processed" || event.type === "meeting_summarized") &&
    "brief" in event &&
    typeof event.brief === "object" &&
    event.brief !== null &&
    "pending" in event.brief
  );
}
