/** The cross-user wake feed. Empty until PR 2 wires the database. */

export interface WakeFeedEntry {
  id: string;
  at: string;
  userName: string;
  conversationId: string;
  eventType: string;
  decision: "send" | "silence" | "error";
  messageCount: number;
  costUsd: number;
  durationMs: number;
}

export function listRecentWakes(): WakeFeedEntry[] {
  return [];
}
