import type { ConversationMessage } from "@/agent/types";
import type { Prisma } from "../../generated/client";

/**
 * What the agent is shown of the message record, in one place.
 *
 * Three readers have to agree exactly: the live conversation window, and
 * both the counting and the folding sides of compaction. They disagree in
 * two different ways when this is duplicated, and both are silent:
 * - a filter that admits a row the renderer mislabels writes a falsehood
 *   into the prompt;
 * - a boundary computed over rows the agent never sees lands in the wrong
 *   place and folds visible messages out of the window behind it.
 */

/**
 * The failureReason a proactive-limit suppression carries. queue.ts holds
 * the Greek label and type-checks this string against the rail vocabulary.
 */
export const PROACTIVE_LIMIT_REASON = "proactive limit";

/**
 * Which message rows count as "what was said" — everything the reader
 * wrote, the outbound rows that reached them, and the sends the proactive
 * limit held back. A failed or still-pending send never appears, so the
 * agent cannot mistake a stopped message for a delivered one.
 *
 * The proactive-limit rows are the one exception, and toConversationMessage
 * marks every one of them. They belong in the window because the agent
 * WROTE that text for this reader: hide it and the next wake writes the same
 * news again, believing it was never said. Every other stopped send is
 * either a retry still in flight or a reader who is gone, and neither is a
 * thing the agent should reason about.
 *
 * A function rather than a shared literal: the return annotation supplies
 * the Prisma types the inline form used to get from context, and every
 * caller gets its own object.
 */
export function conversationMessageFilter(): Prisma.NotisMessageWhereInput {
  return {
    OR: [
      { direction: "inbound" },
      { direction: "outbound", status: { in: ["sent", "delivered", "read"] } },
      {
        direction: "outbound",
        status: "suppressed",
        failureReason: PROACTIVE_LIMIT_REASON,
      },
    ],
  };
}

/** The columns toConversationMessage reads. Every caller selects these, so a
 *  new one cannot forget the pair that decides the notSent marker. */
export const CONVERSATION_ROW_SELECT = {
  direction: true,
  body: true,
  createdAt: true,
  status: true,
  failureReason: true,
} as const;

interface ConversationRow {
  direction: string;
  body: string;
  createdAt: Date;
  status: string | null;
  failureReason: string | null;
}

/**
 * One row as the agent sees it. The marker is read from the row's own
 * reason, not inferred from `suppressed` alone: widening the filter above
 * would otherwise label a pause or an unsubscribe as a proactive-limit hold,
 * with nothing to catch it.
 */
export function toConversationMessage(row: ConversationRow): ConversationMessage {
  return {
    at: row.createdAt.toISOString(),
    from: row.direction === "inbound" ? "reader" : "notis",
    text: row.body,
    ...(row.status === "suppressed" && row.failureReason === PROACTIVE_LIMIT_REASON
      ? ({ notSent: PROACTIVE_LIMIT_REASON } as const)
      : {}),
  };
}
