import type { NotisSubscription, PrismaClient } from "../../generated/client";
import {
  COMPACT_MESSAGES_AT,
  COMPACT_SETTLE_MS,
  COMPACT_WAKES_AT,
  CONVERSATION_WINDOW,
  DECISION_WINDOW,
  Deps,
  MEMORY_MAX_CHARS,
} from "@/agent/types";
import { usageToCost } from "@/agent/pricing";
import { normalizeUsage } from "@/agent/pricing";
import { alert as sendAlert } from "./alert";
import { buildDeps } from "./deps";
import { putSetting } from "./settings";

/**
 * Compaction: everything older than the two live windows, folded into one
 * running memory so a long relationship does not simply fall off the end.
 *
 * The agent reads the newest DECISION_WINDOW wakes and CONVERSATION_WINDOW
 * messages. Before this, everything older was gone — not just promises, but
 * why it stayed silent about something last month, a preference stated once,
 * the shape of the relationship. `memoryThrough` is the watermark: rows at or
 * before it are covered by `memory` and are no longer read row-by-row, so the
 * summary and the windows never overlap.
 *
 * It runs INLINE after a wake completes, not on a schedule. The reply is
 * already on the reader's handset by then (incremental delivery), so nobody
 * waits for it; the wake that triggers it still saw the full uncompacted
 * history; and only readers who are actually active ever pay for it.
 */

export const COMPACTION_STATUS_KEY = "compactionStatus";

export interface CompactionDeps {
  deps?: Deps;
  alert?: (message: string) => Promise<void>;
  now?: () => Date;
}

export interface CompactionResult {
  ran: boolean;
  reason?: string;
  wakesFolded?: number;
  messagesFolded?: number;
  costUsd?: number;
}

/**
 * The instant everything at or before is folded. Three bounds, and the
 * EARLIEST wins:
 *
 * - keep the newest DECISION_WINDOW wakes,
 * - keep the newest CONVERSATION_WINDOW messages (one watermark serves two
 *   streams, so the tighter of the two boundaries governs both),
 * - and never fold anything younger than COMPACT_SETTLE_MS.
 *
 * That last bound is correctness, not tidiness. The conversation only renders
 * outbound messages that reached the reader; a message still `pending` when
 * compaction runs is excluded from the summary AND, once the watermark passes
 * it, from the window behind it — losing it for good. Delivery statuses settle
 * slowly and unevenly, so the margin is generous.
 */
export function computeCut(
  wakeCut: Date | undefined,
  messageCut: Date | undefined,
  now: Date,
): Date | null {
  const settle = new Date(now.getTime() - COMPACT_SETTLE_MS);
  const candidates = [wakeCut, messageCut, settle].filter((d): d is Date => d instanceof Date);
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}

/**
 * Fold this reader's aged-out history into `memory`, if there is enough of it.
 * Never throws: the wake that called this has already succeeded, and losing a
 * summary must not fail it.
 */
export async function maybeCompact(
  db: PrismaClient,
  sub: Pick<NotisSubscription, "id" | "status" | "memory" | "memoryThrough">,
  overrides: CompactionDeps = {},
): Promise<CompactionResult> {
  const alert = overrides.alert ?? ((m: string) => sendAlert("compaction", m));
  const now = overrides.now ?? (() => new Date());

  try {
    // A reader who left will never wake again; summarizing them is pure spend.
    if (sub.status === "unsubscribed") return { ran: false, reason: "unsubscribed" };

    const past = sub.memoryThrough ? { gt: sub.memoryThrough } : undefined;
    const [wakeCount, messageCount] = await Promise.all([
      db.notisWake.count({
        where: { subscriptionId: sub.id, ...(past ? { eventAt: past } : {}) },
      }),
      db.notisMessage.count({
        where: { subscriptionId: sub.id, ...(past ? { createdAt: past } : {}) },
      }),
    ]);
    if (wakeCount <= COMPACT_WAKES_AT && messageCount <= COMPACT_MESSAGES_AT) {
      return { ran: false, reason: "below thresholds" };
    }

    // The boundaries: the oldest row each window still keeps.
    const [wakeEdge, messageEdge] = await Promise.all([
      db.notisWake.findMany({
        where: { subscriptionId: sub.id, ...(past ? { eventAt: past } : {}) },
        orderBy: { eventAt: "desc" },
        skip: DECISION_WINDOW,
        take: 1,
        select: { eventAt: true },
      }),
      db.notisMessage.findMany({
        where: { subscriptionId: sub.id, ...(past ? { createdAt: past } : {}) },
        orderBy: { createdAt: "desc" },
        skip: CONVERSATION_WINDOW,
        take: 1,
        select: { createdAt: true },
      }),
    ]);
    const cut = computeCut(wakeEdge[0]?.eventAt, messageEdge[0]?.createdAt, now());
    if (!cut || (sub.memoryThrough && cut <= sub.memoryThrough)) {
      return { ran: false, reason: "nothing settled to fold" };
    }

    const range = { ...(past ?? {}), lte: cut };
    const [wakes, messages, commitments] = await Promise.all([
      db.notisWake.findMany({
        where: { subscriptionId: sub.id, eventAt: range },
        orderBy: { eventAt: "asc" },
        select: { eventType: true, eventAt: true, decision: true, rationale: true },
      }),
      db.notisMessage.findMany({
        // The SAME filter the live conversation uses, or the summary and the
        // window disagree about what was actually said.
        where: {
          subscriptionId: sub.id,
          createdAt: range,
          OR: [
            { direction: "inbound" },
            { direction: "outbound", status: { in: ["sent", "delivered", "read"] } },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { direction: true, body: true, createdAt: true },
      }),
      db.notisCommitment.findMany({
        where: { subscriptionId: sub.id, resolvedAt: null },
        select: { slug: true, what: true },
      }),
    ]);
    if (wakes.length === 0 && messages.length === 0) {
      // Nothing readable in the range (all suppressed, say) — advance the
      // watermark anyway so the same empty span is not re-examined forever.
      await db.notisSubscription.updateMany({
        where: { id: sub.id, memoryThrough: sub.memoryThrough },
        data: { memoryThrough: cut },
      });
      return { ran: false, reason: "nothing readable in range" };
    }

    const deps = overrides.deps ?? buildDeps();
    const input = [
      `<memory_so_far>`,
      sub.memory || "(empty — this is the first compaction for this reader)",
      `</memory_so_far>`,
      ``,
      `<already_tracked_do_not_repeat>`,
      commitments.length > 0
        ? commitments.map((c) => `[${c.slug}] ${c.what}`).join("\n")
        : "(none)",
      `</already_tracked_do_not_repeat>`,
      ``,
      `<aged_out_messages>`,
      messages
        .map(
          (m) =>
            `[${m.createdAt.toISOString()}] ${
              m.direction === "inbound" ? "they wrote" : "you sent"
            }: «${m.body}»`,
        )
        .join("\n") || "(none)",
      `</aged_out_messages>`,
      ``,
      `<aged_out_decisions>`,
      wakes
        .map(
          (w) =>
            `[${w.eventAt.toISOString()}] ${w.eventType} → ${w.decision}\n  why: ${w.rationale}`,
        )
        .join("\n") || "(none)",
      `</aged_out_decisions>`,
    ].join("\n");

    // Paid work before the write, like the poller's editorial pass: a rollback
    // must never re-bill.
    const response = await deps.anthropic.create({
      model: deps.config.model,
      max_tokens: 4000,
      system: [{ type: "text", text: deps.prompts.compaction }],
      messages: [{ role: "user", content: input }],
      output_config: { effort: deps.config.effort },
    });
    const usage = normalizeUsage(response.usage);
    const costUsd = usageToCost(usage, deps.config.model);

    const text = (response.content as Array<{ type?: string; text?: string }>)
      .filter((b) => b?.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();

    if (!text) {
      await alert(`compaction for ${sub.id} returned no text — memory left as it was`);
      return { ran: false, reason: "empty summary", costUsd };
    }
    if (text.length > MEMORY_MAX_CHARS) {
      // A summary that keeps growing is not a summary. Keep what we had rather
      // than persisting a blob that costs every future wake.
      await alert(
        `compaction for ${sub.id} returned ${text.length} chars (max ${MEMORY_MAX_CHARS}) — memory left as it was`,
      );
      return { ran: false, reason: "summary too long", costUsd };
    }

    // Compare-and-swap on the watermark: if another compaction for this reader
    // finished first, discard this one rather than overwrite its work.
    const written = await db.notisSubscription.updateMany({
      where: { id: sub.id, memoryThrough: sub.memoryThrough },
      data: { memory: text, memoryThrough: cut },
    });
    if (written.count !== 1) return { ran: false, reason: "raced by another compaction", costUsd };

    await putSetting(db, COMPACTION_STATUS_KEY, {
      at: now().toISOString(),
      subscriptionId: sub.id,
      wakesFolded: wakes.length,
      messagesFolded: messages.length,
      costUsd,
    });

    return {
      ran: true,
      wakesFolded: wakes.length,
      messagesFolded: messages.length,
      costUsd,
    };
  } catch (error) {
    // The wake already succeeded. A failed compaction leaves the watermark
    // untouched, so the next wake for this reader simply tries again.
    await alert(
      `compaction failed for ${sub.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ran: false, reason: "error" };
  }
}
