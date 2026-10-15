import type { SupportRequestKind, WakeEvent } from "@/agent/types";
import type { SupportRequestStatus } from "../../generated/client";

/**
 * Pure helpers for support requests: labels, the reader's words, and the
 * line for the alert webhook. No env and no database here, so that the admin
 * panel's client components can import the labels.
 */

export const SUPPORT_REQUEST_KIND_LABELS: Record<SupportRequestKind, string> = {
  dissatisfaction: "δυσαρέσκεια",
  contact: "θέλει επικοινωνία",
  help: "βοήθεια",
  data_error: "λάθος στοιχεία",
};

export const SUPPORT_REQUEST_STATUS_LABELS: Record<SupportRequestStatus, string> = {
  open: "ανοιχτό",
  withdrawn: "αποσύρθηκε",
  closed: "έκλεισε",
};

/** The longest reader transcript a row keeps. The newest words matter most,
 *  so a longer one loses its start. */
export const READER_WORDS_MAX_CHARS = 2000;

/** The last `max` characters of `text`. Counts code points, so that a cut
 *  never splits an emoji into half a surrogate pair. */
function tail(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `…${chars.slice(-max).join("")}` : text;
}

/** What the reader typed in one wake: every user_message, oldest first. */
export function readerWordsOf(events: WakeEvent[]): string {
  const words = [...events]
    .sort((a, b) => a.at.localeCompare(b.at))
    .filter((e): e is Extract<WakeEvent, { type: "user_message" }> => e.type === "user_message")
    .map((e) => e.text.trim())
    .filter(Boolean)
    .join("\n");
  return tail(words, READER_WORDS_MAX_CHARS);
}

/** The words of a later wake, added to an open request's words. */
export function appendReaderWords(existing: string, incoming: string): string {
  if (!incoming) return existing;
  return tail(existing ? `${existing}\n${incoming}` : incoming, READER_WORDS_MAX_CHARS);
}

export function conversationUrl(baseUrl: string, subscriptionId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/admin/conversations/${subscriptionId}`;
}

export type SupportRequestChange = "opened" | "updated" | "withdrawn";

export interface SupportNotification {
  change: SupportRequestChange;
  conversationUrl: string;
  kind?: SupportRequestKind;
}

const CHANGE_TITLES: Record<SupportRequestChange, string> = {
  opened: "Νέο αίτημα υποστήριξης",
  updated: "Ενημερώθηκε το αίτημα υποστήριξης",
  withdrawn: "Αποσύρθηκε το αίτημα υποστήριξης",
};

/**
 * The line for the alert webhook: what happened and where to look, in
 * Greek like the rest of the panel. It carries no personal data: no name,
 * no phone, no words of the reader, and no summary, which the model writes
 * from those words. The operator reads them in the panel, behind the admin
 * login.
 */
export function formatSupportNotification(n: SupportNotification): string {
  const kind = n.kind ? ` (${SUPPORT_REQUEST_KIND_LABELS[n.kind]})` : "";
  return `${CHANGE_TITLES[n.change]}${kind}: ${n.conversationUrl}`;
}
