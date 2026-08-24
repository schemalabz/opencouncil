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
import { normalizeUsage, usageToCost } from "@/agent/pricing";
import { alert as sendAlert } from "./alert";
import { buildDeps } from "./deps";
import { conversationMessageFilter } from "./queue-core";
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
 * Cut to at most `max` characters on the last paragraph or sentence boundary,
 * so a truncated memory still reads as prose rather than stopping mid-word.
 * Falls back to a hard cut only when no boundary sits in the last half.
 */
export function truncateAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const boundary = Math.max(
    slice.lastIndexOf("\n\n"),
    slice.lastIndexOf(". "),
    slice.lastIndexOf(".\n"),
  );
  return (boundary > max / 2 ? slice.slice(0, boundary + 1) : slice).trim();
}

/** One stream's contribution to the cut: how many rows sit past the watermark,
 *  and the oldest row its window still keeps (absent when there are not
 *  enough rows for the window to have an edge at all). */
export interface StreamBound {
  count: number;
  edge?: Date;
}

/**
 * The instant everything at or before is folded, or null when nothing can be.
 *
 * One watermark serves two streams with different window sizes, so each
 * stream gets a veto and the EARLIEST bound wins. A stream contributes one of
 * three things:
 *
 * - **no rows past the watermark** — it has nothing to lose, so no bound;
 * - **fewer rows than its window** — every one of them is still live, so the
 *   stream blocks the fold entirely and compaction waits;
 * - **more than its window** — the oldest row the window still keeps.
 *
 * That middle case is the one worth stating. Treating a missing edge as "no
 * constraint" lets the other stream's boundary fold rows that are still inside
 * this one's live window: a reader with 100 wakes but only 20 messages would
 * have most of those 20 messages folded away by the wake boundary and then
 * excluded from the window behind the watermark — gone for good, despite all
 * 20 sitting well inside the 40-message window.
 *
 * The settle margin caps all of it, and is correctness rather than tidiness.
 * The conversation only renders outbound messages that reached the reader; a
 * message still `pending` when compaction runs is excluded from the summary
 * AND, once the watermark passes it, from the window behind it. Delivery
 * statuses settle slowly and unevenly, so the margin is generous.
 */
export function computeCut(wake: StreamBound, message: StreamBound, now: Date): Date | null {
  const bounds: Date[] = [new Date(now.getTime() - COMPACT_SETTLE_MS)];
  for (const [stream, window] of [
    [wake, DECISION_WINDOW],
    [message, CONVERSATION_WINDOW],
  ] as const) {
    if (stream.count === 0) continue;
    if (stream.count <= window || !stream.edge) return null;
    bounds.push(stream.edge);
  }
  return new Date(Math.min(...bounds.map((d) => d.getTime())));
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
    // Every message query here — counting, edge-finding and folding — uses the
    // SAME filter the live conversation uses. A boundary computed over rows the
    // agent never sees (suppressed, failed, still pending) lands in the wrong
    // place and folds visible messages out of the window behind it.
    const wakeWhere = { subscriptionId: sub.id, ...(past ? { eventAt: past } : {}) };
    const messageWhere = {
      subscriptionId: sub.id,
      ...(past ? { createdAt: past } : {}),
      ...conversationMessageFilter(),
    };

    const [wakeCount, messageCount] = await Promise.all([
      db.notisWake.count({ where: wakeWhere }),
      db.notisMessage.count({ where: messageWhere }),
    ]);
    if (wakeCount <= COMPACT_WAKES_AT && messageCount <= COMPACT_MESSAGES_AT) {
      return { ran: false, reason: "below thresholds" };
    }

    // The boundaries: the oldest row each window still keeps. Absent when the
    // stream holds fewer rows than its window — computeCut reads that as a veto.
    const [wakeEdge, messageEdge] = await Promise.all([
      db.notisWake.findMany({
        where: wakeWhere,
        orderBy: { eventAt: "desc" },
        skip: DECISION_WINDOW,
        take: 1,
        select: { eventAt: true },
      }),
      db.notisMessage.findMany({
        where: messageWhere,
        orderBy: { createdAt: "desc" },
        skip: CONVERSATION_WINDOW,
        take: 1,
        select: { createdAt: true },
      }),
    ]);
    const cut = computeCut(
      { count: wakeCount, edge: wakeEdge[0]?.eventAt },
      { count: messageCount, edge: messageEdge[0]?.createdAt },
      now(),
    );
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
        where: { ...messageWhere, createdAt: range },
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
    let costUsd = 0;
    const summarise = async (corrective?: string): Promise<string> => {
      const response = await deps.anthropic.create({
        model: deps.config.model,
        max_tokens: 4000,
        system: [{ type: "text", text: deps.prompts.compaction }],
        messages: [{ role: "user", content: corrective ? `${input}\n\n${corrective}` : input }],
        output_config: { effort: deps.config.effort },
      });
      costUsd += usageToCost(normalizeUsage(response.usage), deps.config.model);
      return (response.content as Array<{ type?: string; text?: string }>)
        .filter((b) => b?.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
    };

    let text = await summarise();
    if (!text || text.length > MEMORY_MAX_CHARS) {
      // One corrective pass. Both failures are self-perpetuating otherwise:
      // leaving the watermark means the next wake assembles the identical
      // input, gets the identical answer and bills for it — on every wake,
      // for as long as the reader keeps talking.
      text = await summarise(
        text
          ? `(system) Your previous answer was ${text.length} characters. The hard limit ` +
            `is ${MEMORY_MAX_CHARS}. Return the same memory, materially shorter.`
          : "(system) Your previous answer was empty. Return the memory text alone.",
      );
    }

    if (!text) {
      // Empty twice is an anomaly rather than a property of this input, so the
      // watermark stays and the next wake tries again — bounded to two calls
      // per wake, and loud enough that an operator sees it.
      await alert(`compaction for ${sub.id} returned no text twice — memory left as it was`);
      return { ran: false, reason: "empty summary", costUsd };
    }
    if (text.length > MEMORY_MAX_CHARS) {
      // Oversize twice IS a property of this input, so refusing to write would
      // repeat forever. Truncating costs the tail of one summary; not
      // truncating costs the watermark advance, and with it the same fold
      // re-run and re-billed on every future wake. Take the smaller loss.
      const trimmed = truncateAtBoundary(text, MEMORY_MAX_CHARS);
      await alert(
        `compaction for ${sub.id} returned ${text.length} chars twice (max ` +
          `${MEMORY_MAX_CHARS}) — stored ${trimmed.length} and advanced the watermark`,
      );
      text = trimmed;
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
