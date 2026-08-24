// Not "server-only": this module also exports types and pure helpers that
// client components import (e.g. ConversationDetail in the thread view).
// The data-fetching functions here are guarded at their server-page call
// sites (getAdminSession); see the (panel) auth-guard test.
import { CityPreference, WakeOutcome, WakeTrace } from "@/agent/types";
import { clampToActiveHours } from "@/lib/active-hours";
import { TemplateName } from "@/agent/templates";
import { hasNotisDb, notisDb } from "@/lib/db";
import { citiesForUsers } from "@/lib/fanout";
import { hasMainDb } from "@/lib/main-db";
import { LIVE_QUEUE_STATUSES, MAX_ATTEMPTS } from "@/lib/queue-core";
import {
  CityMeta,
  MessageDelivery,
  Origin,
  RecordEvent,
  WakeRecord,
  queueBackedRecords,
  readerMessagesOf,
} from "./records";

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

export interface UpcomingWake {
  id: string;
  reason: string;
  origin: "reply" | "proactive";
  /** After the quiet-hours clamp — where the fire actually lands. */
  firesAt: string;
  createdAt: string;
}

export interface ConversationDetail {
  summary: ConversationSummary;
  records: WakeRecord[];
  cityMeta?: CityMeta;
  profile: string;
  /** The agent's un-fired scheduled wakes for this reader, due-first. */
  upcoming: UpcomingWake[];
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

/** Live preference cities per user; the panel renders without them when the
 *  main database is absent or unreachable. */
async function liveCities(userIds: string[]): Promise<Map<string, CityPreference[]>> {
  if (!hasMainDb() || userIds.length === 0) return new Map();
  try {
    return await citiesForUsers(userIds);
  } catch {
    return new Map();
  }
}

function toSummary(
  sub: SubscriptionRow,
  extras: Pick<
    ConversationSummary,
    "messagesSent" | "messagesReceived" | "messagesFailed" | "wakes" | "costUsd" | "lastMessage"
  >,
  cities: CityPreference[],
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

  const [counts, failures, wakes, costs, lastMessages, citiesByUser] = await Promise.all([
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
    liveCities(subs.map((s) => s.userId)),
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

  return {
    conversations: subs.map((sub) =>
      toSummary(sub, {
        messagesSent: countMap.get(`${sub.id}:outbound`) ?? 0,
        messagesReceived: countMap.get(`${sub.id}:inbound`) ?? 0,
        messagesFailed: failureMap.get(sub.id) ?? 0,
        wakes: wakeMap.get(sub.id) ?? 0,
        costUsd: costMap.get(sub.id) ?? 0,
        lastMessage: lastMap.get(sub.id),
      }, citiesByUser.get(sub.userId) ?? []),
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
        select: {
          id: true,
          event: true,
          events: true,
          outcome: true,
          deliveryMode: true,
          deliveryTemplate: true,
          // Null on a model-less wake (ΣΤΟΠ pre-step, cap skip): those rows
          // have no trace, so the inspector's "deterministic" empty state
          // must see NO traceRef rather than one that fetches nothing.
          model: true,
        },
      },
    },
  });
  if (!sub) return null;

  const [sent, received, outbound] = await Promise.all([
    db.notisMessage.count({ where: { subscriptionId: id, direction: "outbound" } }),
    db.notisMessage.count({ where: { subscriptionId: id, direction: "inbound" } }),
    db.notisMessage.findMany({
      // WhatsApp rows only: the index-alignment with outcome.messages
      // depends on row order matching the outcome, and SMS fallback rows
      // share the wakeId without being outcome messages.
      where: { subscriptionId: id, direction: "outbound", channel: "whatsapp" },
      // All of a wake's rows share one transaction timestamp — the id
      // tiebreaker (cuids are monotonic per process) pins insertion order,
      // which is what the index-alignment with outcome.messages needs.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        wakeId: true,
        status: true,
        failureReason: true,
        createdAt: true,
        body: true,
        deliveryMode: true,
      },
    }),
  ]);

  // SMS fallbacks mark the failed WhatsApp send they replaced.
  // Only fallbacks that reached (or verifiably left for) the reader earn the
  // «εστάλη SMS» marker — a failed or still-held SMS did not rescue anything.
  const smsFallbacks = await db.notisMessage.findMany({
    where: {
      subscriptionId: id,
      channel: "sms",
      fallbackForId: { not: null },
      status: { in: ["sent", "delivered", "read"] },
    },
    select: { fallbackForId: true },
  });
  const fallbackFor = new Set(smsFallbacks.map((m) => m.fallbackForId));

  // Real delivery lifecycles, index-aligned with each wake's messages
  // (created in outcome order inside one transaction).
  // Every outbound WhatsApp row carries its wake's id — including the ΣΤΟΠ
  // pre-step's confirmation, which rides a model-less wake row. The one
  // wakeId-less outbound row is the enrollment intro, whose bubble renders
  // from the subscription's origin instead.
  const deliveriesByWake = new Map<string, MessageDelivery[]>();
  for (const message of outbound) {
    if (message.wakeId === null) continue;
    const delivery: MessageDelivery = {
      status: message.status,
      failureReason: message.failureReason,
      at: message.createdAt.toISOString(),
      ...(fallbackFor.has(message.id) ? { smsFallback: true } : {}),
    };
    deliveriesByWake.set(message.wakeId, [
      ...(deliveriesByWake.get(message.wakeId) ?? []),
      delivery,
    ]);
  }

  const records: WakeRecord[] = sub.wakes.map((wake) => {
    const readers = Array.isArray(wake.events) ? readerMessagesOf(wake.events as unknown[]) : [];
    return {
    id: wake.id,
    event: wake.event as unknown as RecordEvent,
    status: "done" as const,
    ...(readers.length > 1 ? { readerMessages: readers } : {}),
    outcome: wake.outcome as unknown as WakeOutcome,
    ...(wake.model !== null ? { traceRef: wake.id } : {}),
    ...(wake.deliveryMode
      ? {
          delivery:
            wake.deliveryMode === "template" && wake.deliveryTemplate
              ? { mode: "template" as const, template: wake.deliveryTemplate as TemplateName }
              : { mode: "freeform" as const },
        }
      : {}),
    ...(deliveriesByWake.has(wake.id) ? { deliveries: deliveriesByWake.get(wake.id) } : {}),
    ...(Array.isArray(wake.events) ? { coalesced: (wake.events as unknown[]).length } : {}),
    };
  });

  // Orphaned deliveries: freeform outbound rows with no wake — a claim
  // lost or a persist failure after an incremental send. The reader
  // received these, so the audit view must show them; the enrollment intro
  // is the one legitimate wakeId-less row (template mode) and renders from
  // the subscription's origin instead.
  for (const message of outbound) {
    if (message.wakeId !== null || message.deliveryMode === "template") continue;
    records.push({
      id: `orphan:${message.id}`,
      event: { type: "system", at: message.createdAt.toISOString() },
      status: "done",
      outcome: {
        decision: "send",
        rationale:
          "(σύστημα) Ορφανή αποστολή: το μήνυμα στάλθηκε, αλλά το wake του δεν καταγράφηκε — χαμένο claim ή αποτυχία εγγραφής.",
        messages: [message.body],
        scheduledWakes: [],
      },
      deliveries: [
        {
          at: message.createdAt.toISOString(),
          status: message.status,
          failureReason: message.failureReason,
        },
      ],
    });
  }

  // Wakes still in the queue — pending, running, or terminally failed. The
  // reader's message exists before its wake does, and the thread must show
  // it (with the failure, if any) rather than go blank until the wake lands.
  const queueRows = await db.notisWakeQueue.findMany({
    where: { subscriptionId: id, status: { in: [...LIVE_QUEUE_STATUSES] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      events: true,
      attempts: true,
      lastError: true,
      runAfter: true,
    },
  });
  records.push(...queueBackedRecords(queueRows, MAX_ATTEMPTS));

  // Sort on when each record's messages actually went out, falling back to
  // the trigger for records that sent nothing. Sorting on event.at alone
  // placed a wake's replies at the moment it was TRIGGERED, so a 36-second
  // wake whose reader sent ΣΤΟΠ mid-run rendered as question → answer → ΣΤΟΠ
  // when what reached them was question → ΣΤΟΠ → confirmation → the answer
  // half a minute later. Worse once wakes fire on world events, where
  // event.at is the meeting's own time. This viewer is where "did we message
  // someone after they unsubscribed?" gets answered, so the order has to be
  // the reader's.
  const sortKey = (r: WakeRecord) => r.deliveries?.[0]?.at ?? r.event.at;
  records.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const pendingNotes = await db.notisScheduledWake.findMany({
    where: { subscriptionId: id, firedAt: null },
    orderBy: { runAfter: "asc" },
    select: { id: true, reason: true, origin: true, runAfter: true, createdAt: true },
  });
  const nowMs = Date.now();
  const upcoming: UpcomingWake[] = pendingNotes.map((note) => ({
    id: note.id,
    reason: note.reason,
    origin: note.origin,
    firesAt: clampToActiveHours(
      note.runAfter.getTime() > nowMs ? note.runAfter : new Date(nowMs),
      () => 0,
    ).toISOString(),
    createdAt: note.createdAt.toISOString(),
  }));

  const cities = (await liveCities([sub.userId])).get(sub.userId) ?? [];

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
    upcoming,
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
