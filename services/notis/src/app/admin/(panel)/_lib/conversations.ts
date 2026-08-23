import "server-only";
import { WakeOutcome, WakeTrace } from "@/agent/types";
import { TemplateName } from "@/agent/templates";
import { hasNotisDb, notisDb } from "@/lib/db";
import { hasMainDb, mainDb } from "@/lib/main-db";
import { CityMeta, Origin, RecordEvent, WakeRecord } from "./records";

/**
 * Conversation listing + loading, straight from the Notis database. A stored
 * wake carries its event, full outcome, delivery and trace verbatim, so a DB
 * conversation projects into the same WakeRecord shape the playground uses —
 * the viewer needs no reassembly. Without NOTIS_DATABASE_URL the list is
 * empty and lookups miss (playground-only mode).
 */

export interface ConversationSummary {
  id: string;
  userName: string;
  phone: string;
  cityNames: string[];
  origin: Origin;
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
 * would be a second truth that goes stale between refreshes. The panel
 * renders without city chips when no main database is configured, or when it
 * is briefly unreachable — a conversation is still worth reading.
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
  sent: number,
  received: number,
  cities: SubCity[],
): ConversationSummary {
  return {
    id: sub.id,
    userName: sub.userName ?? "—",
    phone: sub.phone ?? "",
    cityNames: cities.map((c) => c.cityName),
    origin: sub.origin,
    startedAt: sub.createdAt.toISOString(),
    lastActivityAt: sub.updatedAt.toISOString(),
    messagesSent: sent,
    messagesReceived: received,
    ...(sub.unsubscribedAt ? { unsubscribedAt: sub.unsubscribedAt.toISOString() } : {}),
  };
}

// The list stops scaling with total history at this bound; older
// conversations stay reachable through their users' direct links.
const CONVERSATION_LIST_LIMIT = 500;

export async function listConversations(): Promise<ConversationSummary[]> {
  if (!hasNotisDb()) return [];
  const db = notisDb();
  const subs = await db.notisSubscription.findMany({
    orderBy: { updatedAt: "desc" },
    take: CONVERSATION_LIST_LIMIT,
  });
  if (subs.length === 0) return [];
  const counts = await db.notisMessage.groupBy({
    by: ["subscriptionId", "direction"],
    where: { subscriptionId: { in: subs.map((s) => s.id) } },
    _count: { _all: true },
  });
  const countMap = new Map(
    counts.map((c) => [`${c.subscriptionId}:${c.direction}`, c._count._all]),
  );
  const cities = await citiesByUser(subs.map((s) => s.userId));
  return subs.map((sub) =>
    toSummary(
      sub,
      countMap.get(`${sub.id}:outbound`) ?? 0,
      countMap.get(`${sub.id}:inbound`) ?? 0,
      cities.get(sub.userId) ?? [],
    ),
  );
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

  const [sent, received] = await Promise.all([
    db.notisMessage.count({ where: { subscriptionId: id, direction: "outbound" } }),
    db.notisMessage.count({ where: { subscriptionId: id, direction: "inbound" } }),
  ]);

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
  }));

  const cities = (await citiesByUser([sub.userId])).get(sub.userId) ?? [];

  return {
    summary: toSummary(sub, sent, received, cities),
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
