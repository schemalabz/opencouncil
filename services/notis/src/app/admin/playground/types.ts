import { WakeState, WakeTrace } from "@/agent/types";
import { PendingBrief, RecordEvent, WakeRecord, hasPendingBrief } from "../_lib/records";

/**
 * Playground store types. The record shape itself lives in ../_lib/records —
 * shared with the read-only conversation viewer; here we keep the
 * simulator-only state around it.
 */

export type { PendingBrief, WakeRecord };
export type QueueEvent = RecordEvent;
/** @deprecated alias — the neutral name is WakeRecord. */
export type QueueItem = WakeRecord;
export { hasPendingBrief };

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
  queue: WakeRecord[];
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
