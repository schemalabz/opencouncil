import { WakeTrace } from "@/agent/types";
import { CityMeta, WakeRecord } from "./records";

/**
 * Conversation listing + loading. PR 1 has no database, so the list is empty
 * and lookups miss; PR 2 replaces the internals with real queries. The
 * detail page already renders records through the shared ConversationView,
 * so wiring real data means only filling these two functions.
 */

export interface ConversationSummary {
  id: string;
  userName: string;
  phone: string;
  cityNames: string[];
  origin: "transition" | "signup";
  startedAt: string;
  lastActivityAt: string;
  messagesSent: number;
  messagesReceived: number;
  unsubscribedAt?: string;
}

export interface ConversationDetail {
  summary: ConversationSummary;
  records: WakeRecord[];
  cityMeta?: CityMeta;
  profile: string;
  traces: Record<string, WakeTrace>;
}

export function listConversations(): ConversationSummary[] {
  return [];
}

export function getConversation(id: string): ConversationDetail | null {
  void id;
  return null;
}
