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
      brief: PendingBrief;
    };

export interface QueueItem {
  id: string;
  event: QueueEvent;
  status: "pending" | "done" | "skipped";
  outcome?: WakeOutcome;
  traceRef?: string;
}

export interface SimSettings {
  model?: string;
  maxTurns?: number;
}

export interface Sim {
  state: WakeState;
  clock: string; // ISO simulated now
  queue: QueueItem[];
  cursor: number; // index of the next pending item
  promptOverride?: string;
  settings: SimSettings;
}

export interface Snapshot {
  id: string;
  label: string;
  takenAt: string; // simulated clock at snapshot time
  sim: Sim;
}

export interface PlaygroundStore {
  version: 1;
  setup: { done: boolean; from: string; to: string };
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
