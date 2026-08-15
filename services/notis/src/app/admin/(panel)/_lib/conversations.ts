import { CityPreference, WakeOutcome, WakeTrace } from "@/agent/types";
import { hasNotisDb, notisDb } from "@/lib/db";
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
  traces: Record<string, WakeTrace>;
}

interface SubscriptionRow {
  id: string;
  userName: string | null;
  phone: string | null;
  cities: unknown;
  origin: Origin;
  createdAt: Date;
  updatedAt: Date;
  unsubscribedAt: Date | null;
}

function subscriptionCities(sub: SubscriptionRow): CityPreference[] {
  return Array.isArray(sub.cities) ? (sub.cities as CityPreference[]) : [];
}

function toSummary(sub: SubscriptionRow, sent: number, received: number): ConversationSummary {
  return {
    id: sub.id,
    userName: sub.userName ?? "—",
    phone: sub.phone ?? "",
    cityNames: subscriptionCities(sub).map((c) => c.cityName),
    origin: sub.origin,
    startedAt: sub.createdAt.toISOString(),
    lastActivityAt: sub.updatedAt.toISOString(),
    messagesSent: sent,
    messagesReceived: received,
    ...(sub.unsubscribedAt ? { unsubscribedAt: sub.unsubscribedAt.toISOString() } : {}),
  };
}

export async function listConversations(): Promise<ConversationSummary[]> {
  if (!hasNotisDb()) return [];
  const db = notisDb();
  const [subs, counts] = await Promise.all([
    db.notisSubscription.findMany({ orderBy: { updatedAt: "desc" } }),
    db.notisMessage.groupBy({ by: ["subscriptionId", "direction"], _count: { _all: true } }),
  ]);
  const countFor = (id: string, direction: "inbound" | "outbound") =>
    counts.find((c) => c.subscriptionId === id && c.direction === direction)?._count._all ?? 0;
  return subs.map((sub) => toSummary(sub, countFor(sub.id, "outbound"), countFor(sub.id, "inbound")));
}

export async function getConversation(id: string): Promise<ConversationDetail | null> {
  if (!hasNotisDb()) return null;
  const db = notisDb();
  const sub = await db.notisSubscription.findUnique({
    where: { id },
    include: { wakes: { orderBy: { createdAt: "asc" } } },
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
    ...(wake.delivery ? { delivery: wake.delivery as unknown as WakeRecord["delivery"] } : {}),
  }));

  return {
    summary: toSummary(sub, sent, received),
    records,
    cityMeta: Object.fromEntries(
      subscriptionCities(sub).map((c) => [c.cityId, { name: c.cityName }]),
    ),
    profile: sub.profileText,
    traces: Object.fromEntries(
      sub.wakes.map((wake) => [wake.id, wake.trace as unknown as WakeTrace]),
    ),
  };
}
