import { hasNotisDb, notisDb } from "@/lib/db";

/**
 * Panel metrics. Without NOTIS_DATABASE_URL (playground-only mode) every
 * number is an honest zero and liveData() is false so pages can label
 * themselves accordingly.
 */

export function liveData(): boolean {
  return hasNotisDb();
}

export interface PanelMetrics {
  users: { total: number; active: number; unsubscribed: number };
  messages: { sent: number; received: number; templated: number; freeform: number };
  wakes: { total: number; sends: number; silences: number; errors: number };
  scheduledFollowups: number;
  costUsd: { month: number; perUserMonth: number | null };
  medianWakeSeconds: number | null;
}

const EMPTY: PanelMetrics = {
  users: { total: 0, active: 0, unsubscribed: 0 },
  messages: { sent: 0, received: 0, templated: 0, freeform: 0 },
  wakes: { total: 0, sends: 0, silences: 0, errors: 0 },
  scheduledFollowups: 0,
  costUsd: { month: 0, perUserMonth: null },
  medianWakeSeconds: null,
};

export async function getPanelMetrics(): Promise<PanelMetrics> {
  if (!hasNotisDb()) return EMPTY;
  const db = notisDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    usersTotal,
    usersActive,
    usersUnsubscribed,
    messagesSent,
    messagesReceived,
    messagesTemplated,
    messagesFreeform,
    wakesTotal,
    wakeSends,
    wakeSilences,
    wakeErrors,
    scheduledFollowups,
    monthCost,
    medianRows,
  ] = await Promise.all([
    db.notisSubscription.count(),
    db.notisSubscription.count({ where: { status: "active" } }),
    db.notisSubscription.count({ where: { status: "unsubscribed" } }),
    db.notisMessage.count({ where: { direction: "outbound" } }),
    db.notisMessage.count({ where: { direction: "inbound" } }),
    db.notisMessage.count({ where: { deliveryMode: "template" } }),
    db.notisMessage.count({ where: { deliveryMode: "freeform" } }),
    db.notisWake.count(),
    db.notisWake.count({ where: { decision: "send" } }),
    db.notisWake.count({ where: { decision: "silence" } }),
    db.notisWake.count({ where: { decision: "error" } }),
    db.notisScheduledWake.count({ where: { firedAt: null } }),
    db.notisWake.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: monthStart } },
    }),
    // Month-bounded like the cost aggregate beside it — percentile_cont has
    // no index shortcut, so an unbounded scan would grow with lifetime wakes.
    db.$queryRaw<Array<{ median: number | null }>>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS median
      FROM "NotisWake"
      WHERE "createdAt" >= ${monthStart}
    `,
  ]);

  const month = monthCost._sum.costUsd ?? 0;
  const median = medianRows[0]?.median;
  return {
    users: { total: usersTotal, active: usersActive, unsubscribed: usersUnsubscribed },
    messages: {
      sent: messagesSent,
      received: messagesReceived,
      templated: messagesTemplated,
      freeform: messagesFreeform,
    },
    wakes: { total: wakesTotal, sends: wakeSends, silences: wakeSilences, errors: wakeErrors },
    scheduledFollowups,
    costUsd: { month, perUserMonth: usersActive > 0 ? month / usersActive : null },
    medianWakeSeconds: median != null ? Number(median) / 1000 : null,
  };
}
