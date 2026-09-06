import type { Prisma, PrismaClient, SubscriptionStatus } from "../../generated/client";
import type { SuppressionReason } from "./queue";

/**
 * The subscription-state transitions, in one place. Four sites move a row
 * out of `active` — the bare ΣΤΟΠ pre-step, the agent's unsubscribe_user
 * tool, the poller's phone-gone reconcile, and the main app's profile switch
 * through the subscriptions API — and each used to carry its own copy of the
 * cleanup that must ride along: nothing queued may outlive an opt-out, and
 * no promise may either. One copy here; each caller runs it inside its own
 * transaction and adds what its ceremony needs (a reply row, the model's
 * wake, a system decision).
 *
 * Only a user action moves a row into or out of `unsubscribed`
 * (schema.prisma): the poller's phone-gone case counts because removing the
 * number IS the user's action.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Kill every pending outbound row of a subscription — the unsubscribe
 * cleanup, shared by ALL status→unsubscribed sites. exceptIds spares the
 * goodbye the unsubscribing wake itself sends.
 */
export async function suppressPendingOutbound(
  db: Db,
  subscriptionId: string,
  exceptIds: string[] = [],
): Promise<void> {
  await db.notisMessage.updateMany({
    where: {
      subscriptionId,
      direction: "outbound",
      status: "pending",
      ...(exceptIds.length > 0 ? { id: { notIn: exceptIds } } : {}),
    },
    data: { status: "suppressed", failureReason: "unsubscribed" satisfies SuppressionReason },
  });
}

export interface UnsubscribeOptions {
  at: Date;
  /** Outbound rows this ceremony itself created — the goodbye survives. */
  exceptMessageIds?: string[];
  /** The phone-gone case: the number left the account, so the row loses it too. */
  clearPhone?: boolean;
}

/**
 * Move a subscription to `unsubscribed`: the status flip (dated `at`),
 * every pending outbound row suppressed, every open commitment resolved.
 * A row that is already unsubscribed keeps the date of the opt-out that
 * counted; the cleanup still runs, because a repeated ΣΤΟΠ must not leave
 * anything queued behind it either.
 */
export async function markUnsubscribed(
  tx: Db,
  sub: { id: string; status: SubscriptionStatus },
  opts: UnsubscribeOptions,
): Promise<void> {
  const already = sub.status === "unsubscribed";
  await tx.notisSubscription.update({
    where: { id: sub.id },
    data: {
      // Always touched: updatedAt is the conversation list's activity sort key.
      updatedAt: opts.at,
      ...(already ? {} : { status: "unsubscribed" as const, unsubscribedAt: opts.at }),
      ...(opts.clearPhone ? { phone: null } : {}),
    },
  });
  await suppressPendingOutbound(tx, sub.id, opts.exceptMessageIds);
  // Promises die with the subscription too, or the panel shows live
  // commitments to someone who left.
  await tx.notisCommitment.updateMany({
    where: { subscriptionId: sub.id, resolvedAt: null },
    data: { resolvedAt: opts.at },
  });
}

export interface ReactivateInput {
  /** The reader's current mobile number, already validated by the caller. */
  phone: string;
  userName?: string | null;
  at: Date;
}

/**
 * Move an unsubscribed subscription back to `active` — the explicit user
 * action the phone-gone rationale asks for («Επανεγγραφή μόνο με ρητή
 * ενέργεια του χρήστη»). Nothing is sent: the next relevant meeting reopens
 * the thread with its own template. Batch work queued before the opt-out is
 * old news, not a welcome back, so its pending rows go; live rows are the
 * reader's own messages and stay.
 */
export async function reactivateSubscription(
  tx: Db,
  sub: { id: string; phone: string | null },
  input: ReactivateInput,
): Promise<void> {
  await tx.notisSubscription.update({
    where: { id: sub.id },
    data: {
      status: "active",
      unsubscribedAt: null,
      phone: input.phone,
      updatedAt: input.at,
      ...(input.userName ? { userName: input.userName } : {}),
      // A Bird conversation belongs to a phone; a new number gets a new one
      // on the next send.
      ...(sub.phone !== input.phone ? { birdConversationId: null } : {}),
    },
  });
  await tx.notisWakeQueue.deleteMany({
    where: { subscriptionId: sub.id, status: "pending", lane: "batch" },
  });
}

export interface SystemDecision {
  rationale: string;
  unsubscribe?: { reason: string };
}

/**
 * A model-less wake row for a decision the shell took on its own (a
 * phone-gone unsubscribe, a profile switch): why this reader's state moved
 * must survive in the decision log, which is the audit answer to "who
 * unsubscribed them". model/trace stay null — no model ran.
 */
export async function recordSystemDecision(
  tx: Db,
  subscriptionId: string,
  at: Date,
  decision: SystemDecision,
): Promise<void> {
  await tx.notisWake.create({
    data: {
      subscriptionId,
      eventType: "system",
      eventAt: at,
      event: { type: "system", at: at.toISOString() } as unknown as Prisma.InputJsonValue,
      decision: "silence",
      rationale: decision.rationale,
      outcome: {
        decision: "silence",
        rationale: decision.rationale,
        messages: [],
        scheduledWakes: [],
        ...(decision.unsubscribe ? { unsubscribe: decision.unsubscribe } : {}),
      } as unknown as Prisma.InputJsonValue,
      costUsd: 0,
      durationMs: 0,
    },
  });
}
