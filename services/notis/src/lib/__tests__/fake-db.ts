import type { PrismaClient } from "../../../generated/client";

/**
 * In-memory Prisma stand-in for the queue/webhook shells. Implements only
 * the exact query shapes those modules issue; anything else throws via the
 * missing method. `calls` records mutation order so tests can assert e.g.
 * "wake committed before Bird send".
 */

export type Row = Record<string, unknown>;

/**
 * Enough of Prisma's where semantics that a fake cannot answer a question the
 * real client would not: scalar equality, `in`/`notIn`, `lt`/`gte` on dates,
 * and a one-level OR.
 *
 * This matters more than it looks. With the where ignored, every reader in
 * runOneWake — the journal window, the seq aggregate, the last-inbound lookup
 * — returned rows belonging to ANY subscription, so a mutation that dropped
 * the subscriptionId scoping left all tests passing while production would
 * have fed one reader's history into another reader's wake.
 */
export function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === "OR") {
      if (!(cond as Row[]).some((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
    if (cond !== null && typeof cond === "object") {
      const c = cond as { in?: unknown[]; notIn?: unknown[]; lt?: Date; gte?: Date; lte?: Date; not?: unknown };
      if (c.in && !c.in.includes(row[key])) return false;
      if (c.notIn && c.notIn.includes(row[key])) return false;
      if (c.not !== undefined && row[key] === c.not) return false;
      const at = row[key] as Date | undefined;
      if (c.lt && !(at && at < c.lt)) return false;
      if (c.gte && !(at && at >= c.gte)) return false;
      if (c.lte && !(at && at <= c.lte)) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

export function makeFakeDb(seed: { subscriptions?: Row[] } = {}) {
  const calls: string[] = [];
  const store = {
    subscriptions: new Map<string, Row>((seed.subscriptions ?? []).map((s) => [s.id as string, s])),
    journal: [] as Row[],
    messages: [] as Row[],
    wakes: [] as Row[],
    scheduled: [] as Row[],
    queue: new Map<string, Row>(),
  };
  let nextId = 1;
  const id = (prefix: string) => `${prefix}_${nextId++}`;

  const db = {
    calls,
    store,
    notisSubscription: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        store.subscriptions.get(where.id) ?? null,
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
    notisJournalEntry: {
      findMany: async ({ where, take }: { where?: Row; take?: number } = {}) => {
        const sorted = store.journal
          .filter((r) => matchesWhere(r, where))
          .sort((a, b) => (b.seq as number) - (a.seq as number));
        return take ? sorted.slice(0, take) : sorted;
      },
      aggregate: async ({ where }: { where?: Row } = {}) => {
        // Scoped like the real query: a seq allocated from another
        // subscription's sequence collides on (subscriptionId, seq).
        const scoped = store.journal.filter((r) => matchesWhere(r, where));
        return {
          _max: {
            seq: scoped.length ? Math.max(...scoped.map((j) => j.seq as number)) : null,
          },
        };
      },
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: id("j"), ...data };
        store.journal.push(row);
        calls.push("journal-created");
        return row;
      },
    },
    notisMessage: {
      findFirst: async ({ where }: { where?: Row } = {}) => {
        const matching = store.messages.filter((m) => matchesWhere(m, where));
        return matching.length ? matching[matching.length - 1] : null;
      },
      findMany: async ({ where, select }: { where?: Row; select?: Row } = {}) => {
        const rows = store.messages.filter((m) => matchesWhere(m, where));
        // The sweeper selects its rows with the subscription attached.
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
      // The full where engine and a real count: the sweeper claims a row with
      // a fenced updateMany and acts only when the count is 1, so a fake that
      // matched on ids alone would report a claim it never made.
      updateMany: async ({ where, data }: { where?: Row; data: Row } = { data: {} }) => {
        const rows = store.messages.filter((m) => matchesWhere(m, where));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
    },
    notisWake: {
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: id("wake"), ...data };
        store.wakes.push(row);
        calls.push("wake-created");
        return row;
      },
    },
    notisScheduledWake: {
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: id("sw"), ...data };
        store.scheduled.push(row);
        return row;
      },
    },
    notisWakeQueue: {
      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: id("q"), status: "pending", attempts: 0, ...data };
        store.queue.set(row.id as string, row);
        calls.push("queue-created");
        return row;
      },
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
        journal: store.journal,
        messages: store.messages,
        wakes: store.wakes,
        scheduled: store.scheduled,
        queue: store.queue,
      });
      try {
        return await fn(db);
      } catch (error) {
        store.subscriptions = snapshot.subscriptions;
        store.journal = snapshot.journal;
        store.messages = snapshot.messages;
        store.wakes = snapshot.wakes;
        store.scheduled = snapshot.scheduled;
        store.queue = snapshot.queue;
        throw error;
      }
    },
  };
  return db as typeof db & PrismaClient;
}

export type FakeDb = ReturnType<typeof makeFakeDb>;
