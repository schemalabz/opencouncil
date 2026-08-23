import { Effort, WakeState, WakeTrace } from "@/agent/types";
import {
  CityMeta,
  Origin,
  PendingBrief,
  RecordEvent,
  WakeRecord,
  hasPendingBrief,
} from "../_lib/records";

/**
 * Playground store types. The record shape itself lives in ../_lib/records —
 * shared with the read-only conversation viewer; here we keep the
 * simulator-only state around it.
 */

export type { CityMeta, Origin, PendingBrief, WakeRecord };
export { hasPendingBrief };

export interface SimSettings {
  model?: string;
  maxTurns?: number;
  /** Reasoning effort per wake — the main cost/quality lever to A/B. */
  effort?: Effort;
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
  queue: WakeRecord[];
  promptOverride?: string;
  settings: SimSettings;
  /** Geocoded coordinates of picked locations, keyed by cityId (for the map). */
  locationPoints?: Record<string, LocationPoint[]>;
  /** How this user entered Notis — decides the intro template. */
  origin: Origin;
  /** When the simulated user last wrote (drives the 24h template window). */
  lastUserMessageAt?: string;
  /** Set when a wake called unsubscribe_user — the sim is a zombie after this. */
  unsubscribedAt?: string;
  /** City display metadata for the timeline (name + logo). */
  cityMeta?: CityMeta;
}

/**
 * The sim's essentials just before a step ran — enough to rewind. Queue items
 * are restored by status from the id list (their briefs, and anything learned
 * after the snapshot like the prompt override, deliberately survive a rewind);
 * items born later (scheduled wakes, injected user messages) are dropped.
 */
export interface Snapshot {
  id: string;
  /** The queue item this snapshot precedes — the rewind target. */
  itemId: string;
  label: string;
  takenAt: string; // simulated clock at snapshot time
  state: WakeState;
  clock: string;
  queue: Array<{ id: string; status: WakeRecord["status"] }>;
  lastUserMessageAt?: string;
  unsubscribedAt?: string;
}

export interface PlaygroundStore {
  version: 3;
  setup: { done: boolean; from: string };
  sim: Sim;
  traces: Record<string, WakeTrace>;
  traceOrder: string[]; // LRU, oldest first
  snapshots: Snapshot[];
}

export const TRACE_CAP = 20;
export const SNAPSHOT_CAP = 30;
export const STORAGE_KEY = "notis:playground:v2";
