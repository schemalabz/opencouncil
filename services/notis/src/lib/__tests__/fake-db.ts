import type { PrismaClient } from "../../../generated/client";

/**
 * In-memory Prisma stand-in for the queue/webhook shells. Implements only
 * the exact query shapes those modules issue; anything else throws via the
 * missing method. `calls` records mutation order so tests can assert e.g.
 * "wake committed before Bird send".
 */

export type Row = Record<string, unknown>;

/** Enough of Prisma's where semantics for the shapes the shells issue:
 *  scalar equality, in/notIn, createdAt gte/lt, and a one-level OR. */
function messageMatches(m: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === "OR") {
      if (!(cond as Row[]).some((branch) => messageMatches(m, branch))) return false;
      continue;
    }
    // A column a row never set is NULL in Postgres, not undefined — so
    // `{ sendingAt: null }` has to match a row that simply has no claim.
    const value = m[key] ?? null;
    if (typeof cond === "object" && cond !== null) {
      const c = cond as { gte?: Date; lt?: Date; lte?: Date; in?: unknown[]; notIn?: unknown[]; not?: unknown };
      if (c.in && !c.in.includes(value)) return false;
      if (c.notIn && c.notIn.includes(value)) return false;
      if (c.not !== undefined && value === c.not) return false;
      const at = value as Date | null;
      if (c.gte && !(at instanceof Date && at >= c.gte)) return false;
      if (c.lt && !(at instanceof Date && at < c.lt)) return false;
      if (c.lte && !(at instanceof Date && at <= c.lte)) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

/** The NotisProcessedEvent unique index, as a map key. */
export function eventIdentity(row: Row): string {
  return `${row.cityId}\u0000${row.meetingId}\u0000${row.type}`;
}

export function makeFakeDb(seed: { subscriptions?: Row[]; settings?: Row[] } = {}) {
  const calls: string[] = [];
  const store = {
    subscriptions: new Map<string, Row>((seed.subscriptions ?? []).map((s) => [s.id as string, s])),
    messages: [] as Row[],
    wakes: [] as Row[],
    scheduled: [] as Row[],
    queue: new Map<string, Row>(),
    settings: new Map<string, Row>((seed.settings ?? []).map((r) => [r.key as string, r])),
    processedEvents: new Map<string, Row>(),
  };
  let nextId = 1;
  const id = (prefix: string) => `${prefix}_${nextId++}`;

  const db = {
    calls,
    store,
    notisSubscription: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.subscriptions.get(where.id) ?? null,
      findMany: async ({ where }: { where?: Row } = {}) =>
        [...store.subscriptions.values()].filter((s) => {
          const w = (where ?? {}) as { userId?: { in: string[] }; status?: string };
          if (w.userId && !w.userId.in.includes(s.userId as string)) return false;
          if (w.status !== undefined && s.status !== w.status) return false;
          return true;
        }),
      findFirst: async ({ where }: { where: { phone: { in: string[] } } }) =>
        [...store.subscriptions.values()].find((s) => where.phone.in.includes(s.phone as string)) ??
        null,
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: id("sub"), status: "active", unsubscribedAt: null, ...data };
        store.subscriptions.set(row.id as string, row);
        calls.push("subscription-created");
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = store.subscriptions.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Row;
        update: Row;
      }) => {
        const existing = [...store.subscriptions.values()].find(
          (s) => s.userId === where.userId,
        );
        if (existing) {
          Object.assign(existing, update);
          calls.push("subscription-upserted:update");
          return existing;
        }
        const row: Row = { id: id("sub"), status: "active", unsubscribedAt: null, ...create };
        store.subscriptions.set(row.id as string, row);
        calls.push("subscription-upserted:create");
        return row;
      },
    },
    notisMessage: {
      count: async ({ where }: { where?: Row } = {}) =>
        store.messages.filter((m) => messageMatches(m, where)).length,
      findFirst: async ({ where }: { where?: Row } = {}) => {
        const matching = store.messages.filter((m) => messageMatches(m, where));
        return matching.length ? matching[matching.length - 1] : null;
      },
      findMany: async ({ where, select }: { where?: Row; select?: Row } = {}) => {
        const rows = store.messages.filter((m) => messageMatches(m, where));
        if (!select?.subscription) return rows;
        return rows.map((m) => ({
          ...m,
          subscription: store.subscriptions.get(m.subscriptionId as string) ?? null,
        }));
      },
      findUnique: async ({ where }: { where: { id?: string; birdMessageId?: string } }) =>
        store.messages.find((m) =>
          where.id !== undefined ? m.id === where.id : m.birdMessageId === where.birdMessageId,
        ) ?? null,
      create: async ({ data }: { data: Row }) => {
        if (
          data.fallbackForId &&
          store.messages.some((m) => m.fallbackForId === data.fallbackForId)
        ) {
          const err = new Error("unique fallbackForId") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: Row = { id: id("msg"), createdAt: new Date(), status: null, ...data };
        store.messages.push(row);
        calls.push(`message-created:${row.direction}`);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = store.messages.find((m) => m.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      // The full where-engine, not just ids: suppressMessages and the
      // held-SMS release both fence on `status`, and a fake that ignored it
      // would let those tests pass while production kept the old row.
      updateMany: async ({ where, data }: { where?: Row; data: Row } = { data: {} }) => {
        const rows = store.messages.filter((m) => messageMatches(m, where));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
    },
    notisWake: {
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: id("wake"), createdAt: new Date(), ...data };
        store.wakes.push(row);
        calls.push("wake-created");
        return row;
      },
      // The decision-log read: newest first by eventAt, id as tiebreaker.
      findMany: async ({ where, take }: { where?: Row; take?: number } = {}) => {
        const sorted = store.wakes
          .filter((r) => messageMatches(r, where))
          .sort((a, b) => {
            const at = (b.eventAt as Date).getTime() - (a.eventAt as Date).getTime();
            return at !== 0 ? at : (b.id as string).localeCompare(a.id as string);
          });
        return take ? sorted.slice(0, take) : sorted;
      },
    },
    notisScheduledWake: {
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: id("sw"), firedAt: null, ...data };
        store.scheduled.push(row);
        return row;
      },
      findMany: async ({ where }: { where?: Row } = {}) =>
        store.scheduled.filter((r) => {
          const w = (where ?? {}) as { firedAt?: null; runAfter?: { lte?: Date } };
          if (w.firedAt === null && r.firedAt !== null) return false;
          if (w.runAfter?.lte && (r.runAfter as Date) > w.runAfter.lte) return false;
          return true;
        }),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const w = where as { id?: string; firedAt?: null };
        let count = 0;
        for (const row of store.scheduled) {
          if (w.id !== undefined && row.id !== w.id) continue;
          if (w.firedAt === null && row.firedAt !== null) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
    },
    notisSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        store.settings.get(where.key) ?? null,
      findMany: async ({ where }: { where?: { key?: { in: string[] } } } = {}) =>
        [...store.settings.values()].filter(
          (r) => !where?.key || where.key.in.includes(r.key as string),
        ),
      upsert: async ({ where, create, update }: { where: { key: string }; create: Row; update: Row }) => {
        const existing = store.settings.get(where.key);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: Row = { ...create };
        store.settings.set(where.key, row);
        return row;
      },
    },
    notisProcessedEvent: {
      findUnique: async ({ where }: { where: { taskId: string } }) =>
        [...store.processedEvents.values()].find((r) => r.taskId === where.taskId) ?? null,
      // The where is ignored on purpose: the poller filters by identity in
      // memory, and returning everything cannot make a dedup test pass that
      // production would fail.
      findMany: async () => [...store.processedEvents.values()],
      create: async ({ data }: { data: Row }) => {
        // Keyed like the real unique index — (cityId, meetingId, type), NOT
        // taskId — so a re-processed meeting collides here exactly as it
        // would in Postgres.
        const key = eventIdentity(data);
        if (store.processedEvents.has(key)) {
          const err = new Error("unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: Row = { processedAt: new Date(), ...data };
        store.processedEvents.set(key, row);
        calls.push("processed-event-created");
        return row;
      },
    },
    notisWakeQueue: {
      create: async ({ data }: { data: Row }) => {
        const row: Row = {
          id: id("q"),
          status: "pending",
          attempts: 0,
          updatedAt: new Date(),
          ...data,
        };
        store.queue.set(row.id as string, row);
        calls.push("queue-created");
        return row;
      },
      findFirst: async ({ where }: { where?: Row } = {}) =>
        [...store.queue.values()].find((q) =>
          Object.entries(where ?? {}).every(([k, v]) => q[k] === v),
        ) ?? null,
      findMany: async ({ where }: { where?: Row } = {}) =>
        [...store.queue.values()].filter((q) =>
          Object.entries(where ?? {}).every(([k, v]) => q[k] === v),
        ),
      // Fenced transitions: match id + optional status/attempts like the
      // real claim-ownership guards do, reporting the matched count.
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: string; attempts?: number };
        data: Row;
      }) => {
        const row = store.queue.get(where.id);
        const matches =
          row &&
          (where.status === undefined || row.status === where.status) &&
          (where.attempts === undefined || row.attempts === where.attempts);
        if (!matches) return { count: 0 };
        Object.assign(row, data);
        calls.push(`queue:${data.status}`);
        return { count: 1 };
      },
      findUnique: async ({ where }: { where: { id: string } }) => store.queue.get(where.id) ?? null,
    },
    // Real rollback semantics: a throw restores the store snapshot, so a
    // transaction that aborts (e.g. the claim fence) leaves no writes.
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = structuredClone({
        subscriptions: store.subscriptions,
        messages: store.messages,
        wakes: store.wakes,
        scheduled: store.scheduled,
        queue: store.queue,
        settings: store.settings,
        processedEvents: store.processedEvents,
      });
      try {
        return await fn(db);
      } catch (error) {
        store.subscriptions = snapshot.subscriptions;
        store.messages = snapshot.messages;
        store.wakes = snapshot.wakes;
        store.scheduled = snapshot.scheduled;
        store.queue = snapshot.queue;
        store.settings = snapshot.settings;
        store.processedEvents = snapshot.processedEvents;
        throw error;
      }
    },
  };
  return db as typeof db & PrismaClient;
}

export type FakeDb = ReturnType<typeof makeFakeDb>;
