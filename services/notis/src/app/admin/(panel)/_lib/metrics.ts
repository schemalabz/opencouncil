/**
 * Panel metrics. PR 1 has no database — every number is an honest zero and
 * `LIVE_DATA` is false so pages can label themselves accordingly. PR 2 swaps
 * the internals of this module for real queries without touching the UI.
 */

export const LIVE_DATA = false;

export interface PanelMetrics {
  users: { total: number; active: number; unsubscribed: number };
  messages: { sent: number; received: number; templated: number; freeform: number };
  wakes: { total: number; sends: number; silences: number; errors: number };
  scheduledFollowups: number;
  costUsd: { month: number; perUserMonth: number | null };
  medianWakeSeconds: number | null;
}

export function getPanelMetrics(): PanelMetrics {
  return {
    users: { total: 0, active: 0, unsubscribed: 0 },
    messages: { sent: 0, received: 0, templated: 0, freeform: 0 },
    wakes: { total: 0, sends: 0, silences: 0, errors: 0 },
    scheduledFollowups: 0,
    costUsd: { month: 0, perUserMonth: null },
    medianWakeSeconds: null,
  };
}
