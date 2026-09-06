import { PHONE_REJECTION_CODES, normalizeMobilePhone } from "@opencouncil/ui/lib/phone";
import type { PrismaClient as MainViewsClient } from "../../generated/main-client";
import type { NotisSubscription, PrismaClient, SubscriptionStatus } from "../../generated/client";
import { normalizePhone } from "./phone";
import { markUnsubscribed, reactivateSubscription, recordSystemDecision } from "./subscription";

/**
 * What the main app's profile switch reads and writes, separated from the
 * HTTP shell so tests drive it with fakes. Notis owns the status; the main
 * app is a client that asks for a state on the reader's explicit action.
 *
 * Off is always honored. On has two shapes: a subscription that exists is
 * reactivated (nothing is sent — the next relevant meeting reopens the
 * thread); a reader with no subscription is left to the poller, which
 * enrolls them with the right intro on its next tick now that the main app
 * has set notifyByPhone.
 */

export interface SubscriptionView {
  status: SubscriptionStatus;
  phone: string | null;
  origin: NotisSubscription["origin"];
  unsubscribedAt: string | null;
  createdAt: string;
}

export function toSubscriptionView(sub: NotisSubscription): SubscriptionView {
  return {
    status: sub.status,
    phone: sub.phone,
    origin: sub.origin,
    unsubscribedAt: sub.unsubscribedAt?.toISOString() ?? null,
    createdAt: sub.createdAt.toISOString(),
  };
}

export type SetStatusResult =
  | { kind: "ok"; subscription: SubscriptionView | null; next?: "poller" }
  | { kind: "rejected"; status: 404 | 409 | 503; code: string };

const UNSUBSCRIBE_RATIONALE =
  "(σύστημα) Απενεργοποίηση από το προφίλ στο OpenCouncil — απεγγραφή.";
const REACTIVATE_RATIONALE =
  "(σύστημα) Ενεργοποίηση από το προφίλ στο OpenCouncil — επανεγγραφή. Κανένα μήνυμα δεν στέλνεται· η επόμενη συνεδρίαση που τον αφορά ανοίγει ξανά τη συζήτηση.";

export async function readSubscription(
  db: PrismaClient,
  userId: string,
): Promise<SubscriptionView | null> {
  const sub = await db.notisSubscription.findUnique({ where: { userId } });
  return sub ? toSubscriptionView(sub) : null;
}

export async function setSubscriptionStatus(
  db: PrismaClient,
  main: MainViewsClient | null,
  userId: string,
  status: SubscriptionStatus,
  now: () => Date = () => new Date(),
): Promise<SetStatusResult> {
  const sub = await db.notisSubscription.findUnique({ where: { userId } });
  if (!sub) {
    // Nothing to flip. For "active" the poller enrolls on its next tick —
    // the unique userId means the two can never race into two rows.
    return { kind: "ok", subscription: null, ...(status === "active" ? { next: "poller" } : {}) };
  }
  if (sub.status === status) return { kind: "ok", subscription: toSubscriptionView(sub) };

  const at = now();
  if (status === "unsubscribed") {
    await db.$transaction(async (tx) => {
      await markUnsubscribed(tx, sub, { at });
      await recordSystemDecision(tx, sub.id, at, {
        rationale: UNSUBSCRIBE_RATIONALE,
        unsubscribe: { reason: "profile" },
      });
    });
  } else {
    // Reactivation needs the reader's current number: the subscription lost
    // it if the phone went away, and it may have changed since.
    if (!main) return { kind: "rejected", status: 503, code: "main_database_unavailable" };
    const user = await main.notisUserRow.findUnique({ where: { id: userId } });
    if (!user) return { kind: "rejected", status: 404, code: "unknown_user" };
    const raw = normalizePhone(user.phone);
    if (!raw) return { kind: "rejected", status: 409, code: PHONE_REJECTION_CODES.empty };
    const parsed = normalizeMobilePhone(raw);
    if (!parsed.ok) return { kind: "rejected", status: 409, code: PHONE_REJECTION_CODES[parsed.reason] };
    const holder = await db.notisSubscription.findFirst({
      where: { phone: parsed.e164, status: "active", NOT: { userId } },
      select: { userId: true },
    });
    if (holder) return { kind: "rejected", status: 409, code: "phone_in_use" };
    await db.$transaction(async (tx) => {
      await reactivateSubscription(tx, sub, { phone: parsed.e164, userName: user.name, at });
      await recordSystemDecision(tx, sub.id, at, { rationale: REACTIVATE_RATIONALE });
    });
  }

  const updated = await db.notisSubscription.findUnique({ where: { userId } });
  return { kind: "ok", subscription: updated ? toSubscriptionView(updated) : null };
}
