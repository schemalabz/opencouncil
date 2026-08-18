import { JournalEntry, WakeOutcome, WakeTrace } from "@/agent/types";
import { TemplateName } from "@/agent/templates";
import { hasNotisDb, notisDb } from "@/lib/db";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { CityMeta, MessageDelivery, Origin, RecordEvent, WakeRecord } from "./records";

/**
 * Conversation listing + loading, straight from the Notis database. A stored
 * wake carries its event, full outcome, delivery and trace verbatim, so a DB
 * conversation projects into the same WakeRecord shape the playground uses —
 * the viewer needs no reassembly. Without NOTIS_DATABASE_URL the list is
 * empty and lookups miss (playground-only mode).
 */

export interface ConversationSummary {
  id: string;
  /** Main-database user id — the stable avatar seed across surfaces. */
  userId: string;
  userName: string;
  phone: string;
  cityNames: string[];
  origin: Origin;
  startedAt: string;
  lastActivityAt: string;
  messagesSent: number;
  messagesReceived: number;
  /** Outbound deliveries that failed — a red flag on the list. */
  messagesFailed: number;
  wakes: number;
  costUsd: number;
  lastMessage?: { body: string; direction: "inbound" | "outbound"; at: string };
  unsubscribedAt?: string;
}

export interface ConversationDetail {
  summary: ConversationSummary;
  records: WakeRecord[];
  cityMeta?: CityMeta;
  profile: string;
}

interface SubscriptionRow {
  id: string;
  userId: string;
  userName: string | null;
  phone: string | null;
  origin: Origin;
  createdAt: Date;
  updatedAt: Date;
  unsubscribedAt: Date | null;
}

interface SubCity {
  cityId: string;
  cityName: string;
}

/**
 * The cities a reader follows, live from notis_fanout_targets. There is no
 * stored copy: preferences live in the main database, and a snapshot here
 * would be a second truth that goes stale between reads. The panel renders
 * without city chips when no main database is configured, or when it is
 * briefly unreachable — a conversation is still worth reading.
 */
async function citiesByUser(userIds: string[]): Promise<Map<string, SubCity[]>> {
  if (!hasMainDb() || userIds.length === 0) return new Map();
  try {
    const rows = await mainDb().fanoutTargetRow.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, cityId: true, cityName: true },
      orderBy: [{ userId: "asc" }, { cityId: "asc" }],
    });
    const byUser = new Map<string, SubCity[]>();
    for (const row of rows) {
      const list = byUser.get(row.userId) ?? [];
      list.push({ cityId: row.cityId, cityName: row.cityName });
      byUser.set(row.userId, list);
    }
    return byUser;
  } catch (e) {
    console.warn("[notis:panel] live city fetch failed, rendering without chips:", e);
    return new Map();
  }
}

function toSummary(
  sub: SubscriptionRow,
  extras: Pick<
    ConversationSummary,
    "messagesSent" | "messagesReceived" | "messagesFailed" | "wakes" | "costUsd" | "lastMessage"
  >,
  cities: SubCity[],
): ConversationSummary {
  return {
    id: sub.id,
    userId: sub.userId,
    userName: sub.userName ?? "—",
    phone: sub.phone ?? "",
    cityNames: cities.map((c) => c.cityName),
    origin: sub.origin,
    startedAt: sub.createdAt.toISOString(),
    lastActivityAt: extras.lastMessage?.at ?? sub.updatedAt.toISOString(),
    ...extras,
    ...(sub.unsubscribedAt ? { unsubscribedAt: sub.unsubscribedAt.toISOString() } : {}),
  };
}

export const CONVERSATIONS_PAGE_SIZE = 50;

export interface ConversationList {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  pages: number;
}

export async function listConversations(search?: string, page = 1): Promise<ConversationList> {
  if (!hasNotisDb()) return { conversations: [], total: 0, page: 1, pages: 1 };
  const db = notisDb();
  const q = search?.trim();
  const where = q
    ? {
        OR: [
          { userName: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
        ],
      }
    : undefined;

  const total = await db.notisSubscription.count({ where });
  const pages = Math.max(1, Math.ceil(total / CONVERSATIONS_PAGE_SIZE));
  const current = Math.min(page, pages);
  const subs = await db.notisSubscription.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (current - 1) * CONVERSATIONS_PAGE_SIZE,
    take: CONVERSATIONS_PAGE_SIZE,
  });
  if (subs.length === 0) return { conversations: [], total, page: current, pages };
  const ids = subs.map((s) => s.id);

  const [counts, failures, wakes, costs, lastMessages] = await Promise.all([
    db.notisMessage.groupBy({
      by: ["subscriptionId", "direction"],
      where: { subscriptionId: { in: ids } },
      _count: { _all: true },
    }),
    db.notisMessage.groupBy({
      by: ["subscriptionId"],
      where: { subscriptionId: { in: ids }, direction: "outbound", status: "failed" },
      _count: { _all: true },
    }),
    db.notisWake.groupBy({
      by: ["subscriptionId"],
      where: { subscriptionId: { in: ids } },
      _count: { _all: true },
    }),
    db.notisWake.groupBy({
      by: ["subscriptionId"],
      where: { subscriptionId: { in: ids } },
      _sum: { costUsd: true },
    }),
    // DISTINCT ON in SQL: Prisma's `distinct` dedupes in memory AFTER
    // fetching every message of every listed conversation. This returns
    // exactly one row per subscription, served by the
    // [subscriptionId, createdAt] index.
    db.$queryRaw<
      Array<{ subscriptionId: string; body: string; direction: string; createdAt: Date }>
    >`
      SELECT DISTINCT ON ("subscriptionId")
             "subscriptionId", body, direction::text AS direction, "createdAt"
      FROM "NotisMessage"
      WHERE "subscriptionId" = ANY(${ids}::text[])
      ORDER BY "subscriptionId", "createdAt" DESC, id DESC
    `,
  ]);

  const countMap = new Map(
    counts.map((c) => [`${c.subscriptionId}:${c.direction}`, c._count._all]),
  );
  const failureMap = new Map(failures.map((f) => [f.subscriptionId, f._count._all]));
  const wakeMap = new Map(wakes.map((w) => [w.subscriptionId, w._count._all]));
  const costMap = new Map(costs.map((c) => [c.subscriptionId, c._sum.costUsd ?? 0]));
  const lastMap = new Map(
    lastMessages.map((m) => [
      m.subscriptionId,
      {
        body: m.body,
        direction: m.direction as "inbound" | "outbound",
        at: m.createdAt.toISOString(),
      },
    ]),
  );

  const cities = await citiesByUser(subs.map((s) => s.userId));

  return {
    conversations: subs.map((sub) =>
      toSummary(sub, {
        messagesSent: countMap.get(`${sub.id}:outbound`) ?? 0,
        messagesReceived: countMap.get(`${sub.id}:inbound`) ?? 0,
        messagesFailed: failureMap.get(sub.id) ?? 0,
        wakes: wakeMap.get(sub.id) ?? 0,
        costUsd: costMap.get(sub.id) ?? 0,
        lastMessage: lastMap.get(sub.id),
      }, cities.get(sub.userId) ?? []),
    ),
    total,
    page: current,
    pages,
  };
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  if (!hasNotisDb()) return null;
  const db = notisDb();
  const sub = await db.notisSubscription.findUnique({
    where: { id },
    include: {
      wakes: {
        orderBy: { createdAt: "asc" },
        // No `trace`: a full WakeTrace runs to hundreds of KB per wake and
        // the inspector shows one at a time — the client fetches a single
        // trace lazily via getWakeTrace.
        select: { id: true, event: true, outcome: true, deliveryMode: true, deliveryTemplate: true },
      },
    },
  });
  if (!sub) return null;

  const [sent, received, outbound] = await Promise.all([
    db.notisMessage.count({ where: { subscriptionId: id, direction: "outbound" } }),
    db.notisMessage.count({ where: { subscriptionId: id, direction: "inbound" } }),
    db.notisMessage.findMany({
      where: { subscriptionId: id, direction: "outbound" },
      // All of a wake's rows share one transaction timestamp — the id
      // tiebreaker (cuids are monotonic per process) pins insertion order,
      // which is what the index-alignment with outcome.messages needs.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { wakeId: true, status: true, failureReason: true },
    }),
  ]);

  // Real delivery lifecycles, index-aligned with each wake's messages
  // (created in outcome order inside one transaction).
  const deliveriesByWake = new Map<string, MessageDelivery[]>();
  const wakelessDeliveries: MessageDelivery[] = [];
  for (const message of outbound) {
    const delivery = { status: message.status, failureReason: message.failureReason };
    if (message.wakeId === null) wakelessDeliveries.push(delivery);
    else {
      deliveriesByWake.set(message.wakeId, [
        ...(deliveriesByWake.get(message.wakeId) ?? []),
        delivery,
      ]);
    }
  }

  const records: WakeRecord[] = sub.wakes.map((wake) => ({
    id: wake.id,
    event: wake.event as unknown as RecordEvent,
    status: "done",
    outcome: wake.outcome as unknown as WakeOutcome,
    traceRef: wake.id,
    ...(wake.deliveryMode
      ? {
          delivery:
            wake.deliveryMode === "template" && wake.deliveryTemplate
              ? { mode: "template" as const, template: wake.deliveryTemplate as TemplateName }
              : { mode: "freeform" as const },
        }
      : {}),
    ...(deliveriesByWake.has(wake.id) ? { deliveries: deliveriesByWake.get(wake.id) } : {}),
  }));

  // The deterministic ΣΤΟΠ pre-step answers without a wake; its journal
  // entry (wakeId null, `received` set) is the only record of the exchange.
  // Synthesize a WakeRecord so the thread shows it — no traceRef, there was
  // no model call to inspect.
  const wakeless = await db.notisJournalEntry.findMany({
    where: { subscriptionId: id, wakeId: null },
    orderBy: { seq: "asc" },
  });
  // Wake-less replies (the ΣΤΟΠ confirmations) pair with wake-less journal
  // entries in order — each entry consumed its messages' worth of sends.
  let wakelessCursor = 0;
  for (const row of wakeless) {
    const entry = row.entry as unknown as JournalEntry;
    if (entry.event !== "user_message" || entry.received === undefined) continue;
    const deliveries = wakelessDeliveries.slice(
      wakelessCursor,
      wakelessCursor + entry.messages.length,
    );
    wakelessCursor += entry.messages.length;
    records.push({
      id: `journal-${row.seq}`,
      event: { type: "user_message", at: entry.at, text: entry.received },
      status: "done",
      outcome: {
        decision: entry.decision === "send" ? "send" : "silence",
        rationale: entry.rationale,
        messages: entry.messages,
        scheduledWakes: [],
        journalAppend: entry,
        ...(entry.unsubscribed ? { unsubscribe: { reason: entry.rationale } } : {}),
      },
      ...(entry.messages.length > 0 ? { delivery: { mode: "freeform" as const } } : {}),
      ...(deliveries.length > 0 ? { deliveries } : {}),
    });
  }
  records.sort((a, b) => a.event.at.localeCompare(b.event.at));

  const cities = (await citiesByUser([sub.userId])).get(sub.userId) ?? [];

  return {
    summary: toSummary(sub, {
      messagesSent: sent,
      messagesReceived: received,
      messagesFailed: outbound.filter((m) => m.status === "failed").length,
      wakes: sub.wakes.length,
      costUsd: 0, // not fetched here; the detail header does not show cost
      lastMessage: undefined,
    }, cities),
    records,
    cityMeta: Object.fromEntries(cities.map((c) => [c.cityId, { name: c.cityName }])),
    profile: sub.profileText,
  };
}

export async function getWakeTrace(wakeId: string): Promise<WakeTrace | null> {
  if (!hasNotisDb()) return null;
  const wake = await notisDb().notisWake.findUnique({
    where: { id: wakeId },
    select: { trace: true },
  });
  return wake ? (wake.trace as unknown as WakeTrace) : null;
}
